/**
 * Controller: AgentController
 *
 * Thin coordinator that manages session lifecycle, routes instructions to the
 * appropriate Use Case, and persists turns.  All I/O is event-driven — no
 * console.log, no readline, no ora.
 *
 * The CLI adapter (or any other UI) subscribes to events and provides an
 * approval callback for the human-in-the-loop safety gate.
 *
 * Dependencies (LLMController, SessionRepository, DiffEngine) are injected
 * via AgentControllerDeps for testability. If not provided, defaults are created.
 */

import path from 'path';

import { LLMController } from '../../infrastructure/api';
import { DiffEngine } from '../services/diff-engine';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { TurnUsage } from '../../domain/entities/conversation-turn';

import { ToolRegistry } from '../orchestration/tool-registry';
import { FileScanTool } from '../tools/file-scan-tool';
import { DirectoryScanner } from '../../infrastructure/filesystem/directory-scanner';
import { FileReadTool } from '../tools/file-read-tool';
import { FileEditTool } from '../tools/file-edit-tool';
import { EditStagingService } from '../services/edit-staging-service';
import { FileReadService } from '../services/file-read-service';
import { LocalFileSystem } from '../../infrastructure/filesystem/local-file-system';
import { PdfReadTool } from '../tools/pdf-read-tool';
import { RExecTool } from '../tools/r-exec-tool';
import { RInstallTool } from '../tools/r-install-tool';
import { RRenderTool } from '../tools/r-render-tool';
import { LibraryScanTool } from '../tools/library-scan-tool';
import { RScriptRunner } from '../../infrastructure/r-adapter/r-script-runner';
import { HistorySummarizer } from '../services/history-summarizer';
import { IntentRouter, Intent } from '../services/intent-router';
import { ModeManager } from '../services/mode-manager';
import { SlashCommandRouter } from '../services/slash-command-router';

import { FileChange } from '../../domain/entities/file-change';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { SessionMessage } from '../../shared/types/messages';

import { ExecuteAskUseCase } from '../use-cases/execute-ask-use-case';
import { ExecuteInstructionUseCase } from '../use-cases/execute-instruction-use-case';
import { ExecuteRunUseCase } from '../use-cases/execute-run-use-case';
import { ExecuteSolverUseCase } from '../use-cases/execute-solver-use-case';
import { ExecuteTutorUseCase } from '../use-cases/execute-tutor-use-case';
import { ExecuteInstallUseCase } from '../use-cases/execute-install-use-case';
import { WorkflowMode } from '../../infrastructure/config/settings';

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
    | { type: 'status_update';     data: { plugins?: string[]; warning?: string; knowledge?: string[] } }
    | { type: 'tool_result_scan';     data: { data: unknown } }
    | { type: 'tool_result_library';  data: { data: unknown } }
    | { type: 'tool_result_r_exec';   data: { data: unknown } }
    | { type: 'tool_result_r_install'; data: { data: unknown } };

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

export interface AgentControllerOptions {
    directory: string;
    sessionId?: string;
    forceNew?: boolean;
}

/** Injectable dependencies — omit any to use the default implementation. */
export interface AgentControllerDeps {
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
    /** Optional — for testability. */
    installUseCase?: ExecuteInstallUseCase;
    /** Optional — for testability. */
    modeManager?: ModeManager;
}

// ── AgentController ───────────────────────────────────────────────────────────

export class AgentController {
    private _session?: ConversationSession;
    private previousSessionSummary = '';
    private readonly llm: LLMController;
    private readonly repo: SessionRepository;
    private readonly registry: ToolRegistry;
    private readonly diffEngine: DiffEngine;
    private readonly viewAdapter: EventCallback;
    private readonly approvalGate: ApprovalCallback;
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
    private readonly installUseCase: ExecuteInstallUseCase;
    private readonly modeManager: ModeManager;
    private readonly slashRouter: SlashCommandRouter;

    /** Throws if initialize() has not been called yet. */
    private get session(): ConversationSession {
        if (!this._session) throw new Error('AgentController not initialized — call initialize() first');
        return this._session;
    }

    constructor(
        options: AgentControllerOptions,
        viewAdapter: EventCallback,
        approvalGate: ApprovalCallback,
        deps?: Partial<AgentControllerDeps>,
    ) {
        this.directory = path.resolve(options.directory);
        this.viewAdapter = viewAdapter;
        this.approvalGate = approvalGate;
        this.llm = deps?.llm ?? LLMController.fromEnv();
        this.repo = deps?.repo ?? new SessionRepository();
        this.diffEngine = deps?.diffEngine ?? new DiffEngine();
        this.summarizer = deps?.summarizer ?? new HistorySummarizer();
        this.pluginLoader = deps?.pluginLoader ?? new PluginLoader();
        this.registry = new ToolRegistry();

        // Sub-services (IntentRouter, use cases) use a broad (type: string, data: Record) emit
        // signature. Create a real bridge function rather than a cast so events are correctly
        // forwarded as AgentEvent objects to viewAdapter.
        const emit = (type: string, data: Record<string, unknown>): void => {
            this.viewAdapter({ type, data } as AgentEvent);
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
        const rRunner = new RScriptRunner();
        this.registry.register(new PdfReadTool(fs));
        this.registry.register(new RExecTool(rRunner));
        this.registry.register(new RInstallTool());
        this.registry.register(new RRenderTool(fs, rRunner));
        this.registry.register(new LibraryScanTool());

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
            onApproval: this.approvalGate,
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
            onApproval: this.approvalGate,
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

        this.installUseCase = deps?.installUseCase ?? new ExecuteInstallUseCase({
            registry: this.registry,
            emit,
        });

        this.modeManager = deps?.modeManager ?? new ModeManager();

        // The context object uses a getter for `session` so the router always
        // sees the current session (which changes on /new).
        const self = this;
        this.slashRouter = new SlashCommandRouter({
            get session() { return self.session; },
            repo: this.repo,
            modeManager: this.modeManager,
            llm: this.llm,
            setSession: (s) => { this._session = s; },
            setPreviousSummary: (s) => { this.previousSessionSummary = s; },
        });
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
            if (prev) this.previousSessionSummary = SlashCommandRouter.formatSessionSummary(prev);
            this._session = ConversationSession.create(model);
        }

        // ModeManager reads settings in its constructor; no extra init needed.

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
        return this.modeManager.getMode();
    }

    /** Execute a question through the ask pipeline (skips intent classification) */
    async executeAsk(instruction: string): Promise<void> {
        const history = await this.prepareHistory();
        return this.executeWithMode(
            instruction,
            () => this.askUseCase.execute(instruction, history, this.previousSessionSummary),
            result => result.content,
        );
    }

    /** Execute one instruction through the full agent pipeline */
    async executeInstruction(instruction: string): Promise<void> {
        const history = await this.prepareHistory();

        // Mode overrides normal intent classification
        const mode = this.modeManager.getMode();
        if (mode === 'solver') {
            return this.executeWithMode(
                instruction,
                () => this.solverUseCase.execute(instruction, history),
                result => result.appliedFiles.length > 0
                    ? `Solution written to: ${result.appliedFiles.join(', ')}.`
                    : 'No solution file was generated.',
            );
        }

        if (mode === 'tutor-socratic') {
            return this.executeWithMode(
                instruction,
                () => this.tutorSocraticUseCase.execute(instruction, history),
                result => result.content,
            );
        }

        if (mode === 'tutor-guide') {
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
            return this.executeWithMode(
                instruction,
                () => this.installUseCase.execute(instruction),
                result => result.content,
            );
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

    /** Handle slash commands — delegates to SlashCommandRouter */
    async handleSlashCommand(command: string): Promise<string> {
        return this.slashRouter.handle(command);
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

    private emit(event: AgentEvent): void {
        this.viewAdapter(event);
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

}

// ── Backward-compat re-exports ────────────────────────────────────────────────
// Keep the old names available so any code that hasn't migrated yet still compiles.
export { AgentController as AgentService };
export type { AgentControllerOptions as AgentServiceOptions };
export type { AgentControllerDeps as AgentServiceDeps };
