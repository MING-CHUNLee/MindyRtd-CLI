/**
 * Service: AgentService
 *
 * Headless, event-driven agent execution extracted from agent.ts.
 * No console.log, no readline, no ora — all I/O via callbacks.
 *
 * The TUI (or any other UI) subscribes to events and provides
 * an approval callback for the human-in-the-loop safety gate.
 */

import fs from 'fs';
import path from 'path';

import { LLMController } from '../../infrastructure/api/llm-controller';
import { DiffEngine } from './diff-engine';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { TurnUsage } from '../../domain/entities/conversation-turn';

import { ToolRegistry } from './tool-registry';
import { Orchestrator } from './orchestrator';
import { FileScanTool } from '../tools/file-scan-tool';
import { FileReadTool } from '../tools/file-read-tool';
import { RExecTool } from '../tools/r-exec-tool';
import { Evaluator } from './evaluator';
import { HistorySummarizer } from './history-summarizer';
import { Artifact } from '../../domain/entities/artifact';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { KnowledgeBase } from './knowledge-base';
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';

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

// ── AgentService ─────────────────────────────────────────────────────────────

export class AgentService {
    private session!: ConversationSession;
    private readonly llm: LLMController;
    private readonly repo: SessionRepository;
    private readonly registry: ToolRegistry;
    private readonly diffEngine: DiffEngine;
    private readonly onEvent: EventCallback;
    private readonly onApproval: ApprovalCallback;
    private readonly directory: string;

    constructor(
        options: AgentServiceOptions,
        onEvent: EventCallback,
        onApproval: ApprovalCallback,
    ) {
        this.directory = path.resolve(options.directory);
        this.onEvent = onEvent;
        this.onApproval = onApproval;
        this.llm = LLMController.fromEnv();
        this.repo = new SessionRepository();
        this.registry = new ToolRegistry();
        this.diffEngine = new DiffEngine();

        // Register built-in tools
        this.registry.register(new FileScanTool());
        this.registry.register(new FileReadTool());
        this.registry.register(new RExecTool());
    }

    /** Initialize: load/create session, load plugins */
    async initialize(options?: { sessionId?: string; forceNew?: boolean }): Promise<void> {
        const model = this.llm.getProviderInfo().model;

        if (options?.sessionId) {
            this.session = (await this.repo.load(options.sessionId)) ?? ConversationSession.create(model);
        } else if (!options?.forceNew) {
            const last = await this.repo.loadLast();
            this.session = last ?? ConversationSession.create(model);
        } else {
            this.session = ConversationSession.create(model);
        }

        this.emit('session_loaded', {
            sessionId: this.session.id,
            turnCount: this.session.turnCount,
            model: this.session.model,
        });

        // Load plugins
        const pluginLoader = new PluginLoader();
        const pluginMetas = await pluginLoader.loadAll(this.registry);
        const loadedPlugins = pluginMetas.filter(m => m.loaded).map(m => m.name);
        if (loadedPlugins.length > 0) {
            this.emit('status_update', { plugins: loadedPlugins });
        }
    }

    /** Get current session */
    getSession(): ConversationSession {
        return this.session;
    }

    /** Execute one instruction through the full agent pipeline */
    async executeInstruction(instruction: string): Promise<void> {
        // History with possible summarization
        const summarizer = new HistorySummarizer();
        const history = summarizer.shouldSummarize(this.session)
            ? await summarizer.summarize(this.session, this.llm)
            : this.session.getHistory().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        // ── Phase 0: Intent classification ───────────────────────────────
        this.emit('phase_start', { phase: 'intent', description: 'Classifying intent' });
        let intent = 'edit';
        try {
            const intentResponse = await this.llm.sendPrompt({
                systemPrompt: 'You are an intent classifier. Determine the user\'s intent and reply with ONLY one word:\n' +
                    '- "ask" — the user wants to ASK A QUESTION, get an explanation, do a code review, analyze code, or understand something\n' +
                    '- "edit" — the user wants to CREATE or MODIFY files, fix bugs, add features, or refactor code\n' +
                    'Default to "ask" if unsure.',
                userMessage: instruction,
                history,
            });
            if (intentResponse.content.trim().toLowerCase().includes('ask')) intent = 'ask';
        } catch { /* default to edit */ }
        this.emit('intent_classified', { intent });
        this.emit('phase_end', { phase: 'intent', success: true });

        if (intent === 'ask') {
            await this.executeAskMode(instruction, history);
            return;
        }

        // ── Phase 1: Orchestrator (ReAct loop) ──────────────────────────
        this.emit('phase_start', { phase: 'orchestrator', description: 'Running agent (ReAct loop)' });

        // RAG — retrieve knowledge
        const kbRepo = new KnowledgeRepository();
        const kb = new KnowledgeBase();
        kb.load(kbRepo.load());
        const knowledgeEntries = kb.retrieve(instruction, 3, this.directory);

        const orchestrator = new Orchestrator(this.llm, this.registry);

        const toolSchemas = this.registry.getSchemas();
        const toolsText = toolSchemas.map(s => {
            const params = Object.entries(s.parameters)
                .map(([k, v]) => `    - ${k} (${v.type}${v.required ? ', required' : ''}): ${v.description}`)
                .join('\n');
            return `- ${s.name}: ${s.description}\n  Parameters:\n${params}` +
                (s.example ? `\n  Example: ${s.example}` : '');
        }).join('\n\n');
        let systemPrompt =
            'You are an expert coding agent that can edit files and analyze R code. ' +
            'You have access to tools to explore the workspace before making edits.\n\n' +
            `Working directory: ${this.directory}\n\n` +
            `Available tools:\n${toolsText}`;

        if (knowledgeEntries.length > 0) {
            const kbText = knowledgeEntries.map(e => `### ${e.title}\n${e.content}`).join('\n\n');
            systemPrompt += `\n\n## Relevant Knowledge\n\n${kbText}`;
            this.emit('status_update', { knowledge: knowledgeEntries.map(e => e.title) });
        }

        const baseRequest = {
            systemPrompt,
            userMessage: instruction,
            history,
            model: undefined as string | undefined,
        };

        let orchResult;
        try {
            orchResult = await orchestrator.run(baseRequest, instruction);
            this.emit('phase_end', {
                phase: 'orchestrator',
                success: true,
                summary: `${orchResult.subTasksRun} sub-task(s), ${orchResult.steps.length} step(s)`,
            });

            // Emit ReAct steps
            for (const step of orchResult.steps) {
                this.emit('react_step', {
                    stepNumber: step.stepNumber,
                    thought: step.thought,
                    action: step.action,
                    observation: step.observation,
                });
            }
        } catch (e) {
            this.emit('phase_end', { phase: 'orchestrator', success: false });
            this.emit('error', { message: e instanceof Error ? e.message : String(e), phase: 'orchestrator' });
            return;
        }

        // ── Phase 2: Extract + validate edit artifacts ──────────────────
        const evaluator = new Evaluator();
        const editArtifacts = orchResult.artifacts.filter(a => a.kind === 'edit');
        const textArtifacts = orchResult.artifacts.filter(a => a.kind === 'text');

        if (textArtifacts.length > 0) {
            for (const a of textArtifacts) {
                this.emit('text_output', { content: a.content });
            }
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

        if (validatedEdits.length === 0) {
            const assistantSummary = textArtifacts.map(a => a.content).join('\n') || 'No changes generated.';
            const domainArtifacts = textArtifacts.map(a => Artifact.create('analysis', a.content));
            this.session.addTurn(instruction, assistantSummary, orchResult.usage, domainArtifacts);
            await this.repo.save(this.session);
            this.emitTurnSaved(orchResult.usage);
            return;
        }

        // ── Phase 3: Human-in-the-Loop Review ───────────────────────────
        this.emit('phase_start', { phase: 'review', description: 'Review proposed changes' });
        const appliedFiles: string[] = [];

        for (const edit of validatedEdits) {
            const absPath = path.resolve(this.directory, edit.path);
            let original = '';
            try { original = fs.readFileSync(absPath, 'utf8'); } catch { /* new file */ }

            if (original === edit.content) continue;

            const diff = this.diffEngine.generateColoredDiff(original, edit.content);
            this.emit('diff_proposed', { path: edit.path, diff, original, proposed: edit.content });

            const approved = await this.onApproval({ path: edit.path, diff, original, proposed: edit.content });
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

        // ── Post: Record turn → save → emit status ──────────────────────
        const assistantSummary = appliedFiles.length > 0
            ? `Applied changes to: ${appliedFiles.join(', ')}.`
            : 'No changes were applied.';

        const domainArtifacts: Artifact[] = [
            ...appliedFiles.map(p =>
                Artifact.create('edit', validatedEdits.find(e => e.path === p)?.content ?? '', p)),
            ...textArtifacts.map(a => Artifact.create('analysis', a.content)),
        ];

        this.session.addTurn(instruction, assistantSummary, orchResult.usage, domainArtifacts);
        await this.repo.save(this.session);
        this.emitTurnSaved(orchResult.usage);
    }

    /** Handle slash commands */
    async handleSlashCommand(command: string): Promise<string> {
        const [cmd, ...args] = command.slice(1).split(' ');
        switch (cmd) {
            case 'status':
                return this.getStatusText();
            case 'new': {
                const model = this.llm.getProviderInfo().model;
                this.session = ConversationSession.create(model);
                return `New session created: ${this.session.id.slice(-6)}`;
            }
            case 'rollback': {
                const target = parseInt(args[0] ?? String(this.session.turnCount - 1), 10);
                try {
                    this.session.rollbackTo(target);
                    await this.repo.save(this.session);
                    return `Rolled back to turn ${target}. Session now has ${this.session.turnCount} turn(s).`;
                } catch (e) {
                    return `Rollback failed: ${e instanceof Error ? e.message : String(e)}`;
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

    // ── Private helpers ──────────────────────────────────────────────────

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

    /** Ask mode: stream a response without tool usage */
    private async executeAskMode(
        instruction: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
    ): Promise<void> {
        // Scan workspace for project context + collect file paths
        this.emit('phase_start', { phase: 'scan', description: 'Scanning workspace for context' });
        let projectContext = '';
        let scannedFiles: Array<{ name: string; path: string }> = [];
        try {
            const scanTool = this.registry.get('file_scan');
            if (scanTool) {
                const scanResult = await scanTool.execute({ directory: this.directory });
                projectContext = scanResult.content;
                // Collect all file names/paths from scan data
                if (scanResult.data) {
                    const data = scanResult.data as { files?: Record<string, Array<{ name: string; path: string }>> };
                    if (data.files) {
                        for (const group of Object.values(data.files)) {
                            if (Array.isArray(group)) {
                                scannedFiles.push(...group.map(f => ({ name: f.name, path: f.path })));
                            }
                        }
                    }
                }
            }
        } catch { /* continue without scan */ }
        this.emit('phase_end', { phase: 'scan', success: true });

        // Auto-read files mentioned in the instruction
        let fileContents = '';
        const instructionLower = instruction.toLowerCase();
        const matchedFiles = scannedFiles.filter(f => instructionLower.includes(f.name.toLowerCase()));

        // If no specific file mentioned but user asks about "project"/"code", read all code files (up to 5)
        const readTargets = matchedFiles.length > 0
            ? matchedFiles
            : scannedFiles.slice(0, 5);

        for (const f of readTargets) {
            try {
                const readTool = this.registry.get('file_read');
                if (readTool) {
                    const result = await readTool.execute({ path: f.path });
                    if (!result.isError) {
                        fileContents += result.content + '\n\n';
                    }
                }
            } catch { /* skip unreadable files */ }
        }

        this.emit('phase_start', { phase: 'ask', description: 'Generating answer' });

        const turnUsage: TurnUsage = {
            inputTokens: 0, outputTokens: 0,
            cacheCreationTokens: 0, cacheReadTokens: 0,
        };

        const systemPrompt =
            'You are an expert developer assistant. Answer the user\'s question clearly and concisely.\n\n' +
            `Working directory: ${this.directory}\n\n` +
            (projectContext ? `## Project Context\n${projectContext}\n\n` : '') +
            (fileContents ? `## File Contents\n${fileContents}` : '');

        try {
            const response = await this.llm.streamPrompt(
                {
                    systemPrompt,
                    userMessage: instruction,
                    history,
                },
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
        } catch (e) {
            this.emit('phase_end', { phase: 'ask', success: false });
            this.emit('error', { message: e instanceof Error ? e.message : String(e), phase: 'ask' });
        }
    }
}
