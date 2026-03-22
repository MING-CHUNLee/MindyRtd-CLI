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
import { FileReadTool } from '../tools/file-read-tool';
import { FileEditTool } from '../tools/file-edit-tool';
import { PdfReadTool } from '../tools/pdf-read-tool';
import { RExecTool } from '../tools/r-exec-tool';
import { RInstallTool } from '../tools/r-install-tool';
import { RRenderTool } from '../tools/r-render-tool';
import { HistorySummarizer } from './history-summarizer';
import { INTENT_CLASSIFIER_SYSTEM_PROMPT } from '../prompts/intent-classifier';

import { FileChange } from '../../domain/entities/file-change';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { SessionMessage } from '../../shared/types/messages';

import { ExecuteAskUseCase } from '../use-cases/execute-ask-use-case';
import { ExecuteInstructionUseCase } from '../use-cases/execute-instruction-use-case';
import { ExecuteRunUseCase } from '../use-cases/execute-run-use-case';

// ── Event Types ──────────────────────────────────────────────────────────────

export type AgentEventType =
    | 'session_loaded'
    | 'intent_classified'
    | 'phase_start'
    | 'phase_end'
    | 'react_step'
    | 'text_output'
    | 'stream_token'
    | 'diff_proposed'
    | 'edit_applied'
    | 'edit_rejected'
    | 'turn_saved'
    | 'error'
    | 'status_update';

export interface AgentEvent {
    type: AgentEventType;
    data: Record<string, unknown>;
}

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
}

// ── AgentService ─────────────────────────────────────────────────────────────

export class AgentService {
    private _session?: ConversationSession;
    private readonly llm: LLMController;
    private readonly repo: SessionRepository;
    private readonly registry: ToolRegistry;
    private readonly diffEngine: DiffEngine;
    private readonly onEvent: EventCallback;
    private readonly onApproval: ApprovalCallback;
    private readonly directory: string;

    private readonly summarizer: HistorySummarizer;
    private readonly pluginLoader: PluginLoader;
    private readonly askUseCase: ExecuteAskUseCase;
    private readonly instructionUseCase: ExecuteInstructionUseCase;
    private readonly runUseCase: ExecuteRunUseCase;

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

        // Register built-in tools
        const fileEditTool = new FileEditTool(this.diffEngine);
        this.registry.register(new FileScanTool());
        this.registry.register(new FileReadTool());
        this.registry.register(fileEditTool);
        this.registry.register(new PdfReadTool());
        this.registry.register(new RExecTool());
        this.registry.register(new RInstallTool());
        this.registry.register(new RRenderTool());

        // Cast to the wider string type expected by use cases (safe: use cases only
        // call emit with valid AgentEventType literals at runtime).
        const emit = this.emit.bind(this) as (type: string, data: Record<string, unknown>) => void;

        this.askUseCase = new ExecuteAskUseCase({
            llm: this.llm,
            registry: this.registry,
            directory: this.directory,
            emit,
        });

        this.instructionUseCase = new ExecuteInstructionUseCase({
            llm: this.llm,
            registry: this.registry,
            diffEngine: this.diffEngine,
            directory: this.directory,
            onApproval: this.onApproval,
            fileEditTool,
            emit,
        });

        this.runUseCase = new ExecuteRunUseCase({
            llm: this.llm,
            registry: this.registry,
            directory: this.directory,
            emit,
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
            this._session = ConversationSession.create(model);
        }

        this.emit('session_loaded', {
            sessionId: this.session.id,
            turnCount: this.session.turnCount,
            model: this.session.model,
        });

        try {
            const pluginMetas = await this.pluginLoader.loadAll(this.registry);
            const loadedPlugins = pluginMetas.filter(meta => meta.loaded).map(meta => meta.name);
            if (loadedPlugins.length > 0) {
                this.emit('status_update', { plugins: loadedPlugins });
            }
        } catch (error) {
            this.emit('status_update', {
                warning: `Plugin loading failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    /** Get current session */
    getSession(): ConversationSession {
        return this.session;
    }

    /** Execute one instruction through the full agent pipeline */
    async executeInstruction(instruction: string): Promise<void> {
        const history = await this.prepareHistory();
        const intent = await this.classifyIntent(instruction, history);

        if (intent === 'ask') {
            try {
                const result = await this.askUseCase.execute(instruction, history);
                this.session.addTurn(instruction, result.content, result.usage);
                await this.repo.save(this.session);
                this.emitTurnSaved(result.usage);
            } catch {
                // Error already emitted by the use case
            }
            return;
        }

        if (intent === 'run') {
            try {
                const result = await this.runUseCase.execute(instruction, history);
                this.session.addTurn(instruction, result.analysis, result.usage);
                await this.repo.save(this.session);
                this.emitTurnSaved(result.usage);
            } catch {
                // Error already emitted by the use case
            }
            return;
        }

        if (intent === 'install') {
            await this.executeInstall(instruction);
            return;
        }

        let result;
        try {
            result = await this.instructionUseCase.execute(instruction, history);
        } catch {
            return; // Error already emitted by the use case
        }

        if (result.analysisSummary !== undefined) {
            // Orchestration produced no edit artifacts — save as analysis turn
            this.session.addTurn(instruction, result.analysisSummary, result.usage, [], result.outputs);
        } else {
            const assistantSummary = result.appliedFiles.length > 0
                ? `Applied changes to: ${result.appliedFiles.join(', ')}.`
                : 'No changes were applied.';

            const fileChanges = result.appliedFiles.map(filePath =>
                FileChange.create('edit', filePath, result.validatedEdits.find(e => e.path === filePath)?.content ?? ''));

            this.session.addTurn(instruction, assistantSummary, result.usage, fileChanges, result.outputs);
        }

        await this.repo.save(this.session);
        this.emitTurnSaved(result.usage);
    }

    /**
     * Install intent: extract package names from the instruction, call r_install,
     * emit the output, and persist the turn.
     */
    private async executeInstall(instruction: string): Promise<void> {
        this.emit('phase_start', { phase: 'install', description: 'Installing R packages' });

        const tool = this.registry.get('r_install');
        if (!tool) {
            this.emit('error', { message: 'r_install tool not available' });
            return;
        }

        // Extract package names: look for word after "install"/"安裝", or fall back to full instruction
        const match = instruction.match(/(?:install|安裝)\s+([\w.,\s]+)/i);
        const packages = match ? match[1].replace(/\s+/g, ',') : instruction;

        const result = await tool.execute({ packages });
        this.emit('phase_end', { phase: 'install', success: !result.isError });
        this.emit('text_output', { content: result.content });

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
            case 'help':
                return [
                    'Available commands:',
                    '  /status   — Show session info',
                    '  /new      — Start a new session',
                    '  /rollback [n] — Roll back to turn n',
                    '  /exit     — Exit the REPL',
                    '  /help     — Show this help',
                ].join('\n');
            default:
                return `Unknown command: /${cmd}. Type /help for available commands.`;
        }
    }

    // ── Private utilities ─────────────────────────────────────────────────────

    private async prepareHistory(): Promise<SessionMessage[]> {
        return this.summarizer.shouldSummarize(this.session)
            ? await this.summarizer.summarize(this.session, this.llm)
            : this.session.getHistory().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    }

    private async classifyIntent(instruction: string, history: SessionMessage[]): Promise<'ask' | 'edit' | 'run' | 'install'> {
        this.emit('phase_start', { phase: 'intent', description: 'Classifying intent' });

        // ── Regex pre-check (deterministic, no LLM call needed) ──────────────
        const definiteIntent = AgentService.detectObviousIntent(instruction);
        if (definiteIntent) {
            this.emit('intent_classified', { intent: definiteIntent });
            this.emit('phase_end', { phase: 'intent', success: true });
            return definiteIntent;
        }

        // ── LLM classification for ambiguous cases ────────────────────────────
        let intent: 'ask' | 'edit' | 'run' | 'install' = 'edit';
        try {
            const intentResponse = await this.llm.sendPrompt({
                systemPrompt: INTENT_CLASSIFIER_SYSTEM_PROMPT,
                userMessage: instruction,
                history,
            });
            const response = intentResponse.content.trim().toLowerCase();
            if (response.includes('install')) intent = 'install';
            else if (response.includes('run')) intent = 'run';
            else if (response.includes('ask')) intent = 'ask';
        } catch (error) {
            this.emit('status_update', {
                warning: `Intent classification failed: ${error instanceof Error ? error.message : String(error)}, defaulting to edit`,
            });
        }
        this.emit('intent_classified', { intent });
        this.emit('phase_end', { phase: 'intent', success: true });
        return intent;
    }

    /**
     * Deterministic intent detection for unambiguous instructions.
     * Returns null if the instruction is ambiguous and needs LLM classification.
     */
    private static detectObviousIntent(instruction: string): 'run' | 'install' | null {
        const lower = instruction.toLowerCase();

        // install: "install X" / "安裝 X" where X looks like a package name
        if (/(?:install|安裝)\s+[A-Za-z0-9._]/.test(instruction)) return 'install';

        // run: explicit execute/run/render keyword + R/Rmd file reference or path
        const hasRunKeyword = /\b(?:execute|run|render|執行|跑|knit)\b/i.test(lower);
        const hasRFile = /\.(?:r|rmd)\b/i.test(instruction);
        if (hasRunKeyword && hasRFile) return 'run';

        // run: bare path to an R/Rmd file (e.g. "C:/foo/bar.Rmd")
        if (/[A-Za-z]:[\\/][^\s]+\.(?:Rmd|rmd|R)\b/.test(instruction)) return 'run';
        if (/\/[^\s]+\.(?:Rmd|rmd|R)\b/.test(instruction)) return 'run';

        return null;
    }

    private emit(type: AgentEventType, data: Record<string, unknown>): void {
        this.onEvent({ type, data });
    }

    private emitTurnSaved(usage: TurnUsage): void {
        const budget = this.session.tokenBudget;
        this.emit('turn_saved', {
            turnCount: this.session.turnCount,
            usage,
            sessionId: this.session.id,
            model: this.session.model,
            usagePercent: budget.usagePercent,
            health: budget.health,
            totalCostUSD: this.session.totalCostUSD,
        });
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
