/**
 * Service: AgentService
 *
 * Headless, event-driven agent execution extracted from agent.ts.
 * No console.log, no readline, no ora — all I/O via callbacks.
 *
 * The TUI (or any other UI) subscribes to events and provides
 * an approval callback for the human-in-the-loop safety gate.
 *
 * Dependencies (LLMController, SessionRepository, DiffEngine) are injected
 * via AgentServiceDeps for testability. If not provided, defaults are created.
 */

import fs from 'fs';
import path from 'path';

import { LLMController } from '../../infrastructure/api/llm-controller';
import { LLMRequestPayload } from '../../shared/types/llm-types';
import { estimateTokens } from '../prompts';
import { DiffEngine } from './diff-engine';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { TurnUsage } from '../../domain/entities/conversation-turn';

import { ToolRegistry } from './tool-registry';
import { Orchestrator, OrchestratorResult, Artifact as OrchestratorArtifact } from './orchestrator';
import { FileScanTool } from '../tools/file-scan-tool';
import { FileReadTool } from '../tools/file-read-tool';
import { RExecTool } from '../tools/r-exec-tool';
import { Evaluator } from './evaluator';
import { HistorySummarizer } from './history-summarizer';
import { Artifact } from '../../domain/entities/artifact';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { KnowledgeBase } from './knowledge-base';
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';
import { SessionMessage } from '../../shared/types/messages';

/**
 * Maximum tokens to allow in the system prompt + history + user message.
 * Keep well below the API limit (e.g. 8 000) so there is room for the response.
 */
const MAX_CONTEXT_TOKENS = 6_000;

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
        this.registry = new ToolRegistry();

        // Register built-in tools
        this.registry.register(new FileScanTool());
        this.registry.register(new FileReadTool());
        this.registry.register(new RExecTool());
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

        // Load plugins
        const pluginLoader = new PluginLoader();
        try {
            const pluginMetas = await pluginLoader.loadAll(this.registry);
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
            await this.executeAskMode(instruction, history);
            return;
        }

        let orchResult: OrchestratorResult;
        let baseRequest: LLMRequestPayload;
        try {
            ({ orchResult, baseRequest } = await this.runOrchestration(instruction, history));
        } catch {
            return; // Error already emitted by runOrchestration
        }

        const { validatedEdits, textArtifacts } = await this.validateArtifacts(orchResult, baseRequest);

        if (validatedEdits.length === 0) {
            const assistantSummary = textArtifacts.map(artifact => artifact.content).join('\n') || 'No changes generated.';
            const domainArtifacts = textArtifacts.map(artifact => Artifact.create('analysis', artifact.content));
            this.session.addTurn(instruction, assistantSummary, orchResult.usage, domainArtifacts);
            await this.repo.save(this.session);
            this.emitTurnSaved(orchResult.usage);
            return;
        }

        const appliedFiles = await this.applyEditsWithApproval(validatedEdits);
        await this.persistTurn(instruction, orchResult, appliedFiles, textArtifacts, validatedEdits);
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

    // ── Phase helpers: executeInstruction ────────────────────────────────────

    private async prepareHistory(): Promise<SessionMessage[]> {
        const summarizer = new HistorySummarizer();
        return summarizer.shouldSummarize(this.session)
            ? await summarizer.summarize(this.session, this.llm)
            : this.session.getHistory().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    }

    private async classifyIntent(instruction: string, history: SessionMessage[]): Promise<'ask' | 'edit'> {
        this.emit('phase_start', { phase: 'intent', description: 'Classifying intent' });
        let intent: 'ask' | 'edit' = 'edit';
        try {
            const intentResponse = await this.llm.sendPrompt({
                systemPrompt:
                    'You are an intent classifier. Determine the user\'s intent and reply with ONLY one word:\n' +
                    '- "ask" — the user wants to ASK A QUESTION, get an explanation, do a code review, analyze code, or understand something\n' +
                    '- "edit" — the user wants to CREATE or MODIFY files, fix bugs, add features, or refactor code\n' +
                    'Default to "ask" if unsure.',
                userMessage: instruction,
                history,
            });
            if (intentResponse.content.trim().toLowerCase().includes('ask')) intent = 'ask';
        } catch (error) {
            this.emit('status_update', {
                warning: `Intent classification failed: ${error instanceof Error ? error.message : String(error)}, defaulting to edit`,
            });
        }
        this.emit('intent_classified', { intent });
        this.emit('phase_end', { phase: 'intent', success: true });
        return intent;
    }

    private async runOrchestration(
        instruction: string,
        history: SessionMessage[],
    ): Promise<{ orchResult: OrchestratorResult; baseRequest: LLMRequestPayload }> {
        this.emit('phase_start', { phase: 'orchestrator', description: 'Running agent (ReAct loop)' });

        const kbRepo = new KnowledgeRepository();
        const kb = new KnowledgeBase();
        kb.load(kbRepo.load());
        const knowledgeEntries = kb.retrieve(instruction, 3, this.directory);

        const orchestrator = new Orchestrator(this.llm, this.registry);

        const toolSchemas = this.registry.getSchemas();
        const toolsText = toolSchemas.map(schema => {
            const params = Object.entries(schema.parameters)
                .map(([k, v]) => `    - ${k} (${v.type}${v.required ? ', required' : ''}): ${v.description}`)
                .join('\n');
            return `- ${schema.name}: ${schema.description}\n  Parameters:\n${params}` +
                (schema.example ? `\n  Example: ${schema.example}` : '');
        }).join('\n\n');

        let systemPrompt =
            'You are an expert coding agent that can edit files and analyze R code. ' +
            'You have access to tools to explore the workspace before making edits.\n\n' +
            `Working directory: ${this.directory}\n\n` +
            `Available tools:\n${toolsText}`;

        if (knowledgeEntries.length > 0) {
            const kbText = knowledgeEntries.map(entry => `### ${entry.title}\n${entry.content}`).join('\n\n');
            systemPrompt += `\n\n## Relevant Knowledge\n\n${kbText}`;
            this.emit('status_update', { knowledge: knowledgeEntries.map(entry => entry.title) });
        }

        const baseRequest: LLMRequestPayload = {
            systemPrompt,
            userMessage: instruction,
            history,
            model: undefined,
        };

        try {
            const orchResult = await orchestrator.run(baseRequest, instruction);
            this.emit('phase_end', {
                phase: 'orchestrator',
                success: true,
                summary: `${orchResult.subTasksRun} sub-task(s), ${orchResult.steps.length} step(s)`,
            });

            for (const step of orchResult.steps) {
                this.emit('react_step', {
                    stepNumber: step.stepNumber,
                    thought: step.thought,
                    action: step.action,
                    observation: step.observation,
                });
            }

            return { orchResult, baseRequest };
        } catch (error) {
            this.emit('phase_end', { phase: 'orchestrator', success: false });
            this.emit('error', {
                message: error instanceof Error ? error.message : String(error),
                phase: 'orchestrator',
            });
            throw error;
        }
    }

    private async validateArtifacts(
        orchResult: OrchestratorResult,
        baseRequest: LLMRequestPayload,
    ): Promise<{
        validatedEdits: Array<{ path: string; content: string }>;
        textArtifacts: OrchestratorArtifact[];
    }> {
        const evaluator = new Evaluator();
        const editArtifacts = orchResult.artifacts.filter(artifact => artifact.kind === 'edit');
        const textArtifacts = orchResult.artifacts.filter(artifact => artifact.kind === 'text');

        for (const artifact of textArtifacts) {
            this.emit('text_output', { content: artifact.content });
        }

        const validatedEdits: Array<{ path: string; content: string }> = [];
        for (const artifact of editArtifacts) {
            const validation = evaluator.validateEditOutput(artifact.content);
            if (validation.valid && validation.artifacts) {
                validatedEdits.push(...validation.artifacts);
            } else {
                const corrected = await evaluator.retryWithCorrection(this.llm, baseRequest, artifact.content);
                const retryValidation = evaluator.validateEditOutput(corrected);
                if (retryValidation.valid && retryValidation.artifacts) {
                    validatedEdits.push(...retryValidation.artifacts);
                } else if (artifact.path) {
                    validatedEdits.push({ path: artifact.path, content: artifact.content });
                }
            }
        }

        return { validatedEdits, textArtifacts };
    }

    private async applyEditsWithApproval(
        validatedEdits: Array<{ path: string; content: string }>,
    ): Promise<string[]> {
        this.emit('phase_start', { phase: 'review', description: 'Review proposed changes' });
        const appliedFiles: string[] = [];

        for (const edit of validatedEdits) {
            const absPath = path.resolve(this.directory, edit.path);
            let original = '';
            try {
                original = fs.readFileSync(absPath, 'utf8');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    // Unexpected error (permission denied, encoding issue, etc.)
                    this.emit('error', {
                        message: `Cannot read ${absPath}: ${(error as Error).message}`,
                        phase: 'review',
                    });
                }
                // ENOENT = new file being created — proceed with empty original
            }

            if (original === edit.content) continue;

            const coloredDiff = this.diffEngine.generateColoredDiff(original, edit.content);
            this.emit('diff_proposed', { path: edit.path, diff: coloredDiff, original, proposed: edit.content });

            const approved = await this.onApproval({
                path: edit.path,
                diff: coloredDiff,
                original,
                proposed: edit.content,
            });
            if (approved) {
                fs.mkdirSync(path.dirname(absPath), { recursive: true });
                fs.writeFileSync(absPath, edit.content, 'utf8');
                this.emit('edit_applied', { path: edit.path });
                appliedFiles.push(edit.path);
            } else {
                this.emit('edit_rejected', { path: edit.path });
            }
        }

        this.emit('phase_end', { phase: 'review', success: true });
        return appliedFiles;
    }

    private async persistTurn(
        instruction: string,
        orchResult: OrchestratorResult,
        appliedFiles: string[],
        textArtifacts: OrchestratorArtifact[],
        validatedEdits: Array<{ path: string; content: string }>,
    ): Promise<void> {
        const assistantSummary = appliedFiles.length > 0
            ? `Applied changes to: ${appliedFiles.join(', ')}.`
            : 'No changes were applied.';

        const domainArtifacts: Artifact[] = [
            ...appliedFiles.map(filePath =>
                Artifact.create('edit', validatedEdits.find(edit => edit.path === filePath)?.content ?? '', filePath)),
            ...textArtifacts.map(artifact => Artifact.create('analysis', artifact.content)),
        ];

        this.session.addTurn(instruction, assistantSummary, orchResult.usage, domainArtifacts);
        await this.repo.save(this.session);
        this.emitTurnSaved(orchResult.usage);
    }

    // ── Phase helpers: executeAskMode ─────────────────────────────────────────

    private isCasualMessage(msg: string): boolean {
        const trimmed = msg.trim();
        return (
            trimmed.length < 30 &&
            !/\b(file|code|bug|error|function|class|import|module|project|refactor|test)\b/i.test(trimmed)
        );
    }

    private async buildProjectContext(): Promise<{
        projectContext: string;
        scannedFiles: Array<{ name: string; path: string }>;
    }> {
        let projectContext = '';
        const scannedFiles: Array<{ name: string; path: string }> = [];

        try {
            const scanTool = this.registry.get('file_scan');
            if (scanTool) {
                const scanResult = await scanTool.execute({ directory: this.directory });
                projectContext = scanResult.content;
                if (scanResult.data) {
                    const data = scanResult.data as { files?: Record<string, Array<{ name: string; path: string }>> };
                    if (data.files) {
                        for (const group of Object.values(data.files)) {
                            if (Array.isArray(group)) {
                                scannedFiles.push(...group.map(file => ({ name: file.name, path: file.path })));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.emit('status_update', {
                warning: `Workspace scan failed, continuing without context: ${error instanceof Error ? error.message : String(error)}`,
            });
        }

        return { projectContext, scannedFiles };
    }

    private async readRelevantFiles(
        instruction: string,
        scannedFiles: Array<{ name: string; path: string }>,
    ): Promise<string> {
        const instructionLower = instruction.toLowerCase();
        const readTargets = scannedFiles.filter(file => instructionLower.includes(file.name.toLowerCase()));

        let fileContents = '';
        for (const file of readTargets) {
            try {
                const readTool = this.registry.get('file_read');
                if (readTool) {
                    const result = await readTool.execute({ path: file.path });
                    if (!result.isError) {
                        fileContents += result.content + '\n\n';
                    }
                }
            } catch (error) {
                this.emit('status_update', {
                    warning: `Could not read file ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }

        return fileContents;
    }

    private assembleAskPrompt(
        history: SessionMessage[],
        instruction: string,
        projectContext: string,
        fileContents: string,
    ): string {
        const basePrompt =
            'You are an expert developer assistant. Answer the user\'s question clearly and concisely.\n\n' +
            `Working directory: ${this.directory}\n\n`;

        const historyTokens = estimateTokens(history.map(m => m.content).join('\n'));
        const userTokens = estimateTokens(instruction);
        const baseTokens = estimateTokens(basePrompt);
        let budget = MAX_CONTEXT_TOKENS - historyTokens - userTokens - baseTokens;

        let contextSection = '';
        if (projectContext && budget > 200) {
            const ctxTokens = estimateTokens(projectContext);
            if (ctxTokens <= budget) {
                contextSection = `## Project Context\n${projectContext}\n\n`;
                budget -= ctxTokens;
            } else {
                const maxChars = budget * 4; // rough: 1 token ≈ 4 chars
                contextSection = `## Project Context\n${projectContext.slice(0, maxChars)}\n[…truncated]\n\n`;
                budget = 0;
            }
        }

        let filesSection = '';
        if (fileContents && budget > 200) {
            const fileTokens = estimateTokens(fileContents);
            if (fileTokens <= budget) {
                filesSection = `## File Contents\n${fileContents}`;
            } else {
                const maxChars = budget * 4;
                filesSection = `## File Contents\n${fileContents.slice(0, maxChars)}\n[…truncated]`;
            }
        }

        return basePrompt + contextSection + filesSection;
    }

    private async streamResponse(
        systemPrompt: string,
        instruction: string,
        history: SessionMessage[],
    ): Promise<void> {
        const turnUsage: TurnUsage = {
            inputTokens: 0, outputTokens: 0,
            cacheCreationTokens: 0, cacheReadTokens: 0,
        };

        try {
            const response = await this.llm.streamPrompt(
                { systemPrompt, userMessage: instruction, history },
                (token) => this.emit('stream_token', { token }),
            );

            if (response.usage) {
                turnUsage.inputTokens += response.usage.promptTokens ?? 0;
                turnUsage.outputTokens += response.usage.completionTokens ?? 0;
            }
            if (response.responseTimeMs) {
                turnUsage.responseTimeMs = response.responseTimeMs;
            }

            this.emit('text_output', { content: response.content });
            this.emit('phase_end', { phase: 'ask', success: true });

            this.session.addTurn(instruction, response.content, turnUsage);
            await this.repo.save(this.session);
            this.emitTurnSaved(turnUsage);
        } catch (error) {
            this.emit('phase_end', { phase: 'ask', success: false });
            this.emit('error', {
                message: error instanceof Error ? error.message : String(error),
                phase: 'ask',
            });
        }
    }

    /** Ask mode: stream a response without tool usage */
    private async executeAskMode(instruction: string, history: SessionMessage[]): Promise<void> {
        const casual = this.isCasualMessage(instruction);

        this.emit('phase_start', { phase: 'scan', description: 'Scanning workspace for context' });
        const { projectContext, scannedFiles } = casual
            ? { projectContext: '', scannedFiles: [] }
            : await this.buildProjectContext();
        this.emit('phase_end', { phase: 'scan', success: true });

        const fileContents = casual ? '' : await this.readRelevantFiles(instruction, scannedFiles);

        this.emit('phase_start', { phase: 'ask', description: 'Generating answer' });
        const systemPrompt = this.assembleAskPrompt(history, instruction, projectContext, fileContents);
        await this.streamResponse(systemPrompt, instruction, history);
    }

    // ── Private utilities ─────────────────────────────────────────────────────

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
