/**
 * Service: AgentService  (facade)
 *
 * Thin coordinator that manages session lifecycle, routes instructions to the
 * appropriate Use Case, and persists turns.  All I/O is event-driven — no
 * console.log, no readline, no ora.
 *
 * The TUI (or any other UI) subscribes to events and provides an approval
 * callback for the human-in-the-loop safety gate.
 *
 * Dependencies (LLMController, SessionRepository, DiffEngine) are injected
 * via AgentServiceDeps for testability. If not provided, defaults are created.
 */

import path from 'path';

import { LLMController } from '../../infrastructure/api/llm-controller';
import { DiffEngine } from './diff-engine';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { TurnUsage } from '../../domain/entities/conversation-turn';

import { ToolRegistry } from './tool-registry';
import { FileScanTool } from '../tools/file-scan-tool';
import { DirectoryScanner } from '../../infrastructure/filesystem/directory-scanner';
import { FileReadTool } from '../tools/file-read-tool';
import { FileEditTool } from '../tools/file-edit-tool';
import { EditStagingService } from './edit-staging-service';
import { FileReadService } from './file-read-service';
import { LocalFileSystem } from '../../infrastructure/filesystem/local-file-system';
import { PdfReadTool } from '../tools/pdf-read-tool';
import { RExecTool } from '../tools/r-exec-tool';
import { RInstallTool } from '../tools/r-install-tool';
import { RRenderTool } from '../tools/r-render-tool';
import { HistorySummarizer } from './history-summarizer';
import { IntentRouter, Intent } from './intent-router';

import { FileChange } from '../../domain/entities/file-change';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { SessionMessage } from '../../shared/types/messages';

import { ExecuteAskUseCase } from '../use-cases/execute-ask-use-case';
import { ExecuteInstructionUseCase } from '../use-cases/execute-instruction-use-case';
import { ExecuteRunUseCase } from '../use-cases/execute-run-use-case';
import { ExecuteSolverUseCase } from '../use-cases/execute-solver-use-case';
import { ExecuteTutorUseCase } from '../use-cases/execute-tutor-use-case';
import { getSettings, saveSettings, WorkflowMode } from '../../infrastructure/config/settings';

// ── Event Types (discriminated union) ────────────────────────────────────────

/** Each variant carries exactly the data that event type needs. */
export type AgentEvent =
    | { type: 'session_loaded';    data: { sessionId: string; turnCount: number; model: string } }
    | { type: 'intent_classified'; data: { intent: string } }
    | { type: 'phase_start';       data: { phase: string; description: string } }
    | { type: 'phase_end';         data: { phase: string; success: boolean; summary?: string } }
    | { type: 'react_step';        data: { stepNumber: number; thought?: string; action?: { tool: string }; observation?: string } }
    | { type: 'text_output';       data: { content: string } }
    | { type: 'stream_token';      data: { token: string } }
    | { type: 'diff_proposed';     data: { path: string; diff: string; original: string; proposed: string } }
    | { type: 'edit_applied';      data: { path: string } }
    | { type: 'edit_rejected';     data: { path: string } }
    | { type: 'turn_saved';        data: { turnCount: number; usage: unknown; sessionId: string; model: string; usagePercent: number; health: string; totalCostUSD: number } }
    | { type: 'error';             data: { message: string; phase?: string } }
    | { type: 'status_update';     data: { plugins?: string[]; warning?: string; knowledge?: string[] } };

/** Convenience alias for the union of all valid event type strings. */
export type AgentEventType = AgentEvent['type'];

export interface ProposedEdit {
    path: string;
    diff: string;
    original: string;
    proposed: string;
}

export type ApprovalCallback = (edit: ProposedEdit) => Promise<boolean>;
export type EventCallback = (event: AgentEvent) => void;

export interface AgentServiceOptions {
    directory: string;
    sessionId?: string;
    forceNew?: boolean;
}

/** Injectable dependencies — omit any to use the default implementation. */
export interface AgentServiceDeps {
    llm: LLMController;
    repo: SessionRepository;
    diffEngine: DiffEngine;
    /** Optional — defaults to new HistorySummarizer(). */
    summarizer?: HistorySummarizer;
    /** Optional — defaults to new PluginLoader(). */
    pluginLoader?: PluginLoader;
    /** Optional — for testability. */
    askUseCase?: ExecuteAskUseCase;
    /** Optional — for testability. */
    instructionUseCase?: ExecuteInstructionUseCase;
    /** Optional — for testability. */
    runUseCase?: ExecuteRunUseCase;
    /** Optional — for testability. */
    solverUseCase?: ExecuteSolverUseCase;
    /** Optional — for testability. */
    tutorSocraticUseCase?: ExecuteTutorUseCase;
    /** Optional — for testability. */
    tutorGuideUseCase?: ExecuteTutorUseCase;
}

// ── AgentService ─────────────────────────────────────────────────────────────

export class AgentService {
    private _session?: ConversationSession;
    private previousSessionSummary = '';
    private readonly llm: LLMController;
    private readonly repo: SessionRepository;
    private readonly registry: ToolRegistry;
    private readonly diffEngine: DiffEngine;
    private readonly onEvent: EventCallback;
    private readonly onApproval: ApprovalCallback;
    private readonly directory: string;

    private readonly summarizer: HistorySummarizer;
    private readonly pluginLoader: PluginLoader;
    private readonly intentRouter: IntentRouter;
    private readonly askUseCase: ExecuteAskUseCase;
    private readonly instructionUseCase: ExecuteInstructionUseCase;
    private readonly runUseCase: ExecuteRunUseCase;
    private readonly solverUseCase: ExecuteSolverUseCase;
    private readonly tutorSocraticUseCase: ExecuteTutorUseCase;
    private readonly tutorGuideUseCase: ExecuteTutorUseCase;
    private activeMode: WorkflowMode = 'default';

    /** Throws if initialize() has not been called yet. */
    private get session(): ConversationSession {
        if (!this._session) throw new Error('AgentService not initialized — call initialize() first');
        return this._session;
    }

    constructor(
        options: AgentServiceOptions,
        onEvent: EventCallback,
        onApproval: ApprovalCallback,
        deps?: Partial<AgentServiceDeps>,
    ) {
        this.directory = path.resolve(options.directory);
        this.onEvent = onEvent;
        this.onApproval = onApproval;
        this.llm = deps?.llm ?? LLMController.fromEnv();
        this.repo = deps?.repo ?? new SessionRepository();
        this.diffEngine = deps?.diffEngine ?? new DiffEngine();
        this.summarizer = deps?.summarizer ?? new HistorySummarizer();
        this.pluginLoader = deps?.pluginLoader ?? new PluginLoader();
        this.registry = new ToolRegistry();

        // Sub-services (IntentRouter, use cases) use a broad (type: string, data: Record) emit
        // signature. Create a real bridge function rather than a cast so events are correctly
        // forwarded as AgentEvent objects to onEvent.
        const emit = (type: string, data: Record<string, unknown>): void => {
            this.onEvent({ type, data } as AgentEvent);
        };
        this.intentRouter = new IntentRouter(this.llm, emit);

        // Register built-in tools
        const fs = new LocalFileSystem();
        const stagingService = new EditStagingService(fs, this.diffEngine);
        const fileEditTool = new FileEditTool(stagingService);
        const fileReadService = new FileReadService(fs);
        this.registry.register(new FileScanTool(new DirectoryScanner()));
        this.registry.register(new FileReadTool(fileReadService));
        this.registry.register(fileEditTool);
        this.registry.register(new PdfReadTool());
        this.registry.register(new RExecTool());
        this.registry.register(new RInstallTool());
        this.registry.register(new RRenderTool());

        // Cast to the wider string type expected by use cases (safe: use cases only
        // call emit with valid AgentEventType literals at runtime).
        this.askUseCase = deps?.askUseCase ?? new ExecuteAskUseCase({
            llm: this.llm,
            registry: this.registry,
            directory: this.directory,
            emit,
        });

        this.instructionUseCase = deps?.instructionUseCase ?? new ExecuteInstructionUseCase({
            llm: this.llm,
            registry: this.registry,
            diffEngine: this.diffEngine,
            directory: this.directory,
            onApproval: this.onApproval,
            stagingService,
            emit,
        });

        this.runUseCase = deps?.runUseCase ?? new ExecuteRunUseCase({
            llm: this.llm,
            registry: this.registry,
            directory: this.directory,
            emit,
        });

        this.solverUseCase = deps?.solverUseCase ?? new ExecuteSolverUseCase({
            llm: this.llm,
            registry: this.registry,
            diffEngine: this.diffEngine,
            directory: this.directory,
            onApproval: this.onApproval,
            stagingService,
            emit,
        });

        this.tutorSocraticUseCase = deps?.tutorSocraticUseCase ?? new ExecuteTutorUseCase(
            { llm: this.llm, registry: this.registry, directory: this.directory, emit },
            'socratic',
        );

        this.tutorGuideUseCase = deps?.tutorGuideUseCase ?? new ExecuteTutorUseCase(
            { llm: this.llm, registry: this.registry, directory: this.directory, emit },
            'guide',
        );
    }

    /** Initialize: load/create session, load plugins */
    async initialize(options?: { sessionId?: string; forceNew?: boolean }): Promise<void> {
        const model = this.llm.getProviderInfo().model;

        if (options?.sessionId) {
            this._session = (await this.repo.load(options.sessionId)) ?? ConversationSession.create(model);
        } else if (!options?.forceNew) {
            const last = await this.repo.loadLast();
            this._session = last ?? ConversationSession.create(model);
        } else {
            // forceNew: load the last session's summary for cross-session context
            const prev = await this.repo.loadLast();
            if (prev) this.previousSessionSummary = AgentService.formatSessionSummary(prev);
            this._session = ConversationSession.create(model);
        }

        this.activeMode = getSettings().workflowMode;

        this.emit({ type: 'session_loaded', data: {
            sessionId: this.session.id,
            turnCount: this.session.turnCount,
            model: this.session.model,
        } });

        try {
            const pluginMetas = await this.pluginLoader.loadAll(this.registry);
            const loadedPlugins = pluginMetas.filter(meta => meta.loaded).map(meta => meta.name);
            if (loadedPlugins.length > 0) {
                this.emit({ type: 'status_update', data: { plugins: loadedPlugins } });
            }
        } catch (error) {
            this.emit({ type: 'status_update', data: {
                warning: `Plugin loading failed: ${error instanceof Error ? error.message : String(error)}`,
            } });
        }
    }

    /** Get current session */
    getSession(): ConversationSession {
        return this.session;
    }

    /** Get the currently active workflow mode */
    getMode(): WorkflowMode {
        return this.activeMode;
    }

    /** Execute one instruction through the full agent pipeline */
    async executeInstruction(instruction: string): Promise<void> {
        const history = await this.prepareHistory();

        // Mode overrides normal intent classification
        if (this.activeMode === 'solver') {
            return this.executeWithMode(
                instruction,
                () => this.solverUseCase.execute(instruction, history),
                result => result.appliedFiles.length > 0
                    ? `Solution written to: ${result.appliedFiles.join(', ')}.`
                    : 'No solution file was generated.',
            );
        }

        if (this.activeMode === 'tutor-socratic') {
            return this.executeWithMode(
                instruction,
                () => this.tutorSocraticUseCase.execute(instruction, history),
                result => result.content,
            );
        }

        if (this.activeMode === 'tutor-guide') {
            return this.executeWithMode(
                instruction,
                () => this.tutorGuideUseCase.execute(instruction, history),
                result => result.content,
            );
        }

        const intent = await this.classifyIntent(instruction, history);

        if (intent === 'ask') {
            return this.executeWithMode(
                instruction,
                () => this.askUseCase.execute(instruction, history, this.previousSessionSummary),
                result => result.content,
            );
        }

        if (intent === 'run') {
            return this.executeWithMode(
                instruction,
                () => this.runUseCase.execute(instruction, history),
                result => result.analysis,
            );
        }

        if (intent === 'install') {
            await this.executeInstall(instruction);
            return;
        }

        let result;
        try {
            result = await this.instructionUseCase.execute(instruction, history);
        } catch (error) {
            this.emit({ type: 'error', data: {
                message: error instanceof Error ? error.message : String(error),
            } });
            return;
        }

        if (result.analysisSummary !== undefined) {
            // Orchestration produced no edit artifacts — save as analysis turn
            this.session.addTurn(instruction, result.analysisSummary, result.usage, [], result.outputs);
        } else {
            const assistantSummary = result.appliedFiles.length > 0
                ? `Applied changes to: ${result.appliedFiles.join(', ')}.`
                : 'No changes were applied.';

            const fileChanges = result.appliedFiles
                .map(filePath => {
                    const edit = result.validatedEdits.find(e => e.path === filePath);
                    return edit ? FileChange.create('edit', filePath, edit.content) : null;
                })
                .filter((fc): fc is FileChange => fc !== null);

            this.session.addTurn(instruction, assistantSummary, result.usage, fileChanges, result.outputs);
        }

        await this.repo.save(this.session);
        this.emitTurnSaved(result.usage);
    }

    /**
     * Generic helper that executes a use case, persists the turn, and emits
     * turn_saved — or emits an error event if the use case throws unexpectedly.
     */
    private async executeWithMode<T extends { usage: TurnUsage }>(
        instruction: string,
        execute: () => Promise<T>,
        toTurnContent: (result: T) => string,
    ): Promise<void> {
        try {
            const result = await execute();
            this.session.addTurn(instruction, toTurnContent(result), result.usage);
            await this.repo.save(this.session);
            this.emitTurnSaved(result.usage);
        } catch (error) {
            this.emit({ type: 'error', data: {
                message: error instanceof Error ? error.message : String(error),
            } });
        }
    }

    /**
     * Install intent: extract package names from the instruction, call r_install,
     * emit the output, and persist the turn.
     */
    private async executeInstall(instruction: string): Promise<void> {
        this.emit({ type: 'phase_start', data: { phase: 'install', description: 'Installing R packages' } });

        const tool = this.registry.get('r_install');
        if (!tool) {
            this.emit({ type: 'error', data: { message: 'r_install tool not available' } });
            return;
        }

        // Extract package names: look for word after "install"/"安裝", or fall back to full instruction
        const match = instruction.match(/(?:install|安裝)\s+([\w.,\s]+)/i);
        const packages = match ? match[1].replace(/\s+/g, ',') : instruction;

        const result = await tool.execute({ packages });
        this.emit({ type: 'phase_end', data: { phase: 'install', success: !result.isError } });
        this.emit({ type: 'text_output', data: { content: result.content } });

        const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
        this.session.addTurn(instruction, result.content, usage);
        await this.repo.save(this.session);
        this.emitTurnSaved(usage);
    }

    /** Handle slash commands */
    async handleSlashCommand(command: string): Promise<string> {
        const [cmd, ...args] = command.slice(1).split(' ');
        switch (cmd) {
            case 'status':
                return this.getStatusText();
            case 'new': {
                this.previousSessionSummary = AgentService.formatSessionSummary(this.session);
                const model = this.llm.getProviderInfo().model;
                this._session = ConversationSession.create(model);
                return `New session created: ${this.session.id.slice(-6)}`;
            }
            case 'rollback': {
                const target = parseInt(args[0] ?? String(this.session.turnCount - 1), 10);
                try {
                    this.session.rollbackTo(target);
                    await this.repo.save(this.session);
                    return `Rolled back to turn ${target}. Session now has ${this.session.turnCount} turn(s).`;
                } catch (error) {
                    return `Rollback failed: ${error instanceof Error ? error.message : String(error)}`;
                }
            }
            case 'solver':
            case 'tutor-socratic':
            case 'tutor-guide':
            case 'default': {
                const newMode = cmd as WorkflowMode;
                this.activeMode = newMode;
                const settings = getSettings();
                saveSettings({ ...settings, workflowMode: newMode });
                return `Mode: ${newMode}`;
            }
            case 'mode':
                return `Current mode: ${this.activeMode}`;
            case 'help':
                return [
                    'Available commands:',
                    '  /status          — Show session info',
                    '  /new             — Start a new session',
                    '  /rollback [n]    — Roll back to turn n',
                    '  /solver          — Switch to solver mode (generates solution files)',
                    '  /tutor-socratic  — Switch to Socratic tutor mode (guides with questions)',
                    '  /tutor-guide     — Switch to guided tutor mode (step-by-step hints)',
                    '  /default         — Return to normal mode',
                    '  /mode            — Show current active mode',
                    '  /exit            — Exit the REPL',
                    '  /help            — Show this help',
                ].join('\n');
            default:
                return `Unknown command: /${cmd}. Type /help for available commands.`;
        }
    }

    // ── Private utilities ─────────────────────────────────────────────────────

    private async prepareHistory(): Promise<SessionMessage[]> {
        return this.summarizer.shouldSummarize(this.session)
            ? await this.summarizer.summarize(this.session, this.llm)
            : this.session.getHistory().map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));
    }

    private async classifyIntent(instruction: string, history: SessionMessage[]): Promise<Intent> {
        return this.intentRouter.classify(instruction, history);
    }

    /** Build a compact summary of the last few turns for cross-session context. */
    private static formatSessionSummary(session: ConversationSession): string {
        const history = session.getHistory();
        if (history.length === 0) return '';
        const lastN = history.slice(-6); // at most 3 user+assistant pairs
        const lines = lastN.map(m => {
            const role = m.role === 'user' ? 'User' : 'Assistant';
            const snippet = m.content.length > 300 ? m.content.slice(0, 300) + '…' : m.content;
            return `${role}: ${snippet}`;
        });
        return `[Previous session — last ${Math.floor(lastN.length / 2)} turn(s)]\n${lines.join('\n')}`;
    }

    private emit(event: AgentEvent): void {
        this.onEvent(event);
    }

    private emitTurnSaved(usage: TurnUsage): void {
        const budget = this.session.tokenBudget;
        this.emit({ type: 'turn_saved', data: {
            turnCount: this.session.turnCount,
            usage,
            sessionId: this.session.id,
            model: this.session.model,
            usagePercent: budget.usagePercent,
            health: budget.health,
            totalCostUSD: this.session.totalCostUSD,
        } });
    }

    private getStatusText(): string {
        const budget = this.session.tokenBudget;
        const cache = this.session.cacheStatus;
        return [
            `Session: ${this.session.id.slice(-6)} | Turn: ${this.session.turnCount} | Model: ${this.session.model}`,
            `Context: ${budget.usagePercent}% (${budget.health})`,
            `Cost: ~$${this.session.totalCostUSD.toFixed(4)}`,
            cache.hasCacheActivity ? `Cache: ${(cache.cacheReadTokens / 1_000).toFixed(1)}k tokens saved` : '',
        ].filter(Boolean).join('\n');
    }
}
