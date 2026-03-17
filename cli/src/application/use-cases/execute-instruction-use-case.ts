/**
 * Use Case: ExecuteInstructionUseCase
 *
 * Handles the edit / orchestration pipeline: runs the ReAct loop, validates
 * LLM-proposed file edits, applies them with user approval.
 *
 * Returns InstructionResult — the caller is responsible for persisting the
 * session turn.
 */

import fs from 'fs';
import path from 'path';

import { LLMController } from '../../infrastructure/api/llm-controller';
import { LLMRequestPayload } from '../../shared/types/llm-types';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { ToolRegistry } from '../services/tool-registry';
import { DiffEngine } from '../services/diff-engine';
import { SessionMessage } from '../../shared/types/messages';
import { Orchestrator, OrchestratorResult, Artifact as OrchestratorArtifact } from '../services/orchestrator';
import { Evaluator } from '../services/evaluator';
import { KnowledgeBase } from '../services/knowledge-base';
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';

// Re-export so the facade can reference OrchestratorArtifact without importing
// directly from the orchestrator module.
export type { OrchestratorArtifact };

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteInstructionDeps {
    llm: LLMController;
    registry: ToolRegistry;
    diffEngine: DiffEngine;
    directory: string;
    /** Human-in-the-loop callback: returns true to apply the edit, false to skip. */
    onApproval: (edit: { path: string; diff: string; original: string; proposed: string }) => Promise<boolean>;
    emit: EmitFn;
}

export interface InstructionResult {
    appliedFiles: string[];
    textArtifacts: OrchestratorArtifact[];
    validatedEdits: Array<{ path: string; content: string }>;
    usage: TurnUsage;
    /** Set when orchestration produced no edit artifacts (analysis-only response). */
    analysisSummary?: string;
}

// ── ExecuteInstructionUseCase ─────────────────────────────────────────────────

export class ExecuteInstructionUseCase {
    constructor(private readonly deps: ExecuteInstructionDeps) {}

    async execute(instruction: string, history: SessionMessage[]): Promise<InstructionResult> {
        let orchResult: OrchestratorResult;
        let baseRequest: LLMRequestPayload;
        try {
            ({ orchResult, baseRequest } = await this.runOrchestration(instruction, history));
        } catch {
            throw new Error('Orchestration failed'); // error already emitted by runOrchestration
        }

        const { validatedEdits, textArtifacts } = await this.validateArtifacts(orchResult, baseRequest);

        if (validatedEdits.length === 0) {
            const analysisSummary = textArtifacts.map(a => a.content).join('\n') || 'No changes generated.';
            return {
                appliedFiles: [],
                textArtifacts,
                validatedEdits: [],
                usage: orchResult.usage,
                analysisSummary,
            };
        }

        const appliedFiles = await this.applyEditsWithApproval(validatedEdits);
        return { appliedFiles, textArtifacts, validatedEdits, usage: orchResult.usage };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async runOrchestration(
        instruction: string,
        history: SessionMessage[],
    ): Promise<{ orchResult: OrchestratorResult; baseRequest: LLMRequestPayload }> {
        this.deps.emit('phase_start', { phase: 'orchestrator', description: 'Running agent (ReAct loop)' });

        const kbRepo = new KnowledgeRepository();
        const kb = new KnowledgeBase();
        kb.load(kbRepo.load());
        const knowledgeEntries = kb.retrieve(instruction, 3, this.deps.directory);

        const orchestrator = new Orchestrator(this.deps.llm, this.deps.registry);

        const toolSchemas = this.deps.registry.getSchemas();
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
            `Working directory: ${this.deps.directory}\n\n` +
            `Available tools:\n${toolsText}`;

        if (knowledgeEntries.length > 0) {
            const kbText = knowledgeEntries.map(entry => `### ${entry.title}\n${entry.content}`).join('\n\n');
            systemPrompt += `\n\n## Relevant Knowledge\n\n${kbText}`;
            this.deps.emit('status_update', { knowledge: knowledgeEntries.map(entry => entry.title) });
        }

        const baseRequest: LLMRequestPayload = {
            systemPrompt,
            userMessage: instruction,
            history,
            model: undefined,
        };

        try {
            const orchResult = await orchestrator.run(baseRequest, instruction);
            this.deps.emit('phase_end', {
                phase: 'orchestrator',
                success: true,
                summary: `${orchResult.subTasksRun} sub-task(s), ${orchResult.steps.length} step(s)`,
            });

            for (const step of orchResult.steps) {
                this.deps.emit('react_step', {
                    stepNumber: step.stepNumber,
                    thought: step.thought,
                    action: step.action,
                    observation: step.observation,
                });
            }

            return { orchResult, baseRequest };
        } catch (error) {
            this.deps.emit('phase_end', { phase: 'orchestrator', success: false });
            this.deps.emit('error', {
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
        const editArtifacts = orchResult.artifacts.filter(a => a.kind === 'edit');
        const textArtifacts = orchResult.artifacts.filter(a => a.kind === 'text');

        for (const artifact of textArtifacts) {
            this.deps.emit('text_output', { content: artifact.content });
        }

        const validatedEdits: Array<{ path: string; content: string }> = [];
        for (const artifact of editArtifacts) {
            const validation = evaluator.validateEditOutput(artifact.content);
            if (validation.valid && validation.artifacts) {
                validatedEdits.push(...validation.artifacts);
            } else {
                const corrected = await evaluator.retryWithCorrection(this.deps.llm, baseRequest, artifact.content);
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
        this.deps.emit('phase_start', { phase: 'review', description: 'Review proposed changes' });
        const appliedFiles: string[] = [];

        for (const edit of validatedEdits) {
            const absPath = path.resolve(this.deps.directory, edit.path);
            let original = '';
            try {
                original = fs.readFileSync(absPath, 'utf8');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    this.deps.emit('error', {
                        message: `Cannot read ${absPath}: ${(error as Error).message}`,
                        phase: 'review',
                    });
                }
                // ENOENT = new file being created — proceed with empty original
            }

            if (original === edit.content) continue;

            const coloredDiff = this.deps.diffEngine.generateColoredDiff(original, edit.content);
            this.deps.emit('diff_proposed', { path: edit.path, diff: coloredDiff, original, proposed: edit.content });

            const approved = await this.deps.onApproval({
                path: edit.path,
                diff: coloredDiff,
                original,
                proposed: edit.content,
            });
            if (approved) {
                fs.mkdirSync(path.dirname(absPath), { recursive: true });
                fs.writeFileSync(absPath, edit.content, 'utf8');
                this.deps.emit('edit_applied', { path: edit.path });
                appliedFiles.push(edit.path);
            } else {
                this.deps.emit('edit_rejected', { path: edit.path });
            }
        }

        this.deps.emit('phase_end', { phase: 'review', success: true });
        return appliedFiles;
    }
}
