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
import { Orchestrator, OrchestratorResult } from '../services/orchestrator';
import { LLMOutput } from '../../domain/entities/llm-output';
import { Evaluator } from '../services/evaluator';
import { KnowledgeBase } from '../services/knowledge-base';
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';
import { FileEditTool, StagedEdit } from '../tools/file-edit-tool';

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteInstructionDeps {
    llm: LLMController;
    registry: ToolRegistry;
    diffEngine: DiffEngine;
    directory: string;
    /** Human-in-the-loop callback: returns true to apply the edit, false to skip. */
    onApproval: (edit: { path: string; diff: string; original: string; proposed: string }) => Promise<boolean>;
    emit: EmitFn;
    /** Optional — defaults to a KnowledgeBase loaded from KnowledgeRepository. */
    knowledgeBase?: KnowledgeBase;
    /** Optional — defaults to new Evaluator(). */
    evaluator?: Evaluator;
    /** Optional — defaults to new Orchestrator(llm, registry). */
    orchestrator?: Orchestrator;
    /** Optional — defaults to a new FileEditTool(diffEngine). */
    fileEditTool?: FileEditTool;
}

export interface InstructionResult {
    appliedFiles: string[];
    outputs: LLMOutput[];
    validatedEdits: Array<{ path: string; content: string }>;
    usage: TurnUsage;
    /** Set when orchestration produced no edit artifacts (analysis-only response). */
    analysisSummary?: string;
}

// ── ExecuteInstructionUseCase ─────────────────────────────────────────────────

export class ExecuteInstructionUseCase {
    private readonly knowledgeBase: KnowledgeBase;
    private readonly evaluator: Evaluator;
    private readonly orchestrator: Orchestrator;
    private readonly fileEditTool: FileEditTool;

    constructor(private readonly deps: ExecuteInstructionDeps) {
        if (deps.knowledgeBase) {
            this.knowledgeBase = deps.knowledgeBase;
        } else {
            const kbRepo = new KnowledgeRepository();
            this.knowledgeBase = new KnowledgeBase();
            this.knowledgeBase.load(kbRepo.load());
        }
        this.evaluator = deps.evaluator ?? new Evaluator();
        this.orchestrator = deps.orchestrator ?? new Orchestrator(deps.llm, deps.registry);
        this.fileEditTool = deps.fileEditTool ?? new FileEditTool(deps.diffEngine);
    }

    async execute(instruction: string, history: SessionMessage[]): Promise<InstructionResult> {
        let orchResult: OrchestratorResult;
        let baseRequest: LLMRequestPayload;
        try {
            ({ orchResult, baseRequest } = await this.runOrchestration(instruction, history));
        } catch {
            throw new Error('Orchestration failed'); // error already emitted by runOrchestration
        }

        const { validatedEdits, outputs } = await this.validateArtifacts(orchResult, baseRequest);

        // Collect edits from two sources:
        //   1. ReAct tool calls  → already staged inside FileEditTool with original + diff pre-computed
        //   2. LLM artifact JSON → converted to StagedEdit here (read original, compute diff)
        const toolStagedEdits = this.fileEditTool.drainStagedEdits();
        const artifactEdits = this.buildStagedEditsFromArtifacts(validatedEdits);
        const allEdits = [...toolStagedEdits, ...artifactEdits];

        if (allEdits.length === 0) {
            const analysisSummary = outputs.map(o => o.content).join('\n') || 'No changes generated.';
            return {
                appliedFiles: [],
                outputs,
                validatedEdits,
                usage: orchResult.usage,
                analysisSummary,
            };
        }

        const appliedFiles = await this.applyEditsWithApproval(allEdits);
        return { appliedFiles, outputs, validatedEdits, usage: orchResult.usage };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async runOrchestration(
        instruction: string,
        history: SessionMessage[],
    ): Promise<{ orchResult: OrchestratorResult; baseRequest: LLMRequestPayload }> {
        this.deps.emit('phase_start', { phase: 'orchestrator', description: 'Running agent (ReAct loop)' });

        const knowledgeEntries = this.knowledgeBase.retrieve(instruction, 3, this.deps.directory);

        const orchestrator = this.orchestrator;

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
        outputs: LLMOutput[];
    }> {
        const evaluator = this.evaluator;

        for (const output of orchResult.outputs) {
            this.deps.emit('text_output', { content: output.content });
        }

        const validatedEdits: Array<{ path: string; content: string }> = [];
        for (const fc of orchResult.fileChanges) {
            const validation = evaluator.validateEditOutput(fc.content);
            if (validation.valid && validation.artifacts) {
                validatedEdits.push(...validation.artifacts);
            } else {
                const corrected = await evaluator.retryWithCorrection(this.deps.llm, baseRequest, fc.content);
                const retryValidation = evaluator.validateEditOutput(corrected);
                if (retryValidation.valid && retryValidation.artifacts) {
                    validatedEdits.push(...retryValidation.artifacts);
                } else {
                    validatedEdits.push({ path: fc.path, content: fc.content });
                }
            }
        }

        return { validatedEdits, outputs: orchResult.outputs };
    }

    /**
     * Convert artifact-extracted edits (from LLM JSON blob) into StagedEdit objects
     * by reading the original file from disk and computing the diff.
     * Skips edits where the proposed content is identical to the current file.
     */
    private buildStagedEditsFromArtifacts(
        artifacts: Array<{ path: string; content: string }>,
    ): StagedEdit[] {
        const staged: StagedEdit[] = [];
        for (const artifact of artifacts) {
            const absPath = path.resolve(this.deps.directory, artifact.path);
            let original = '';
            try {
                original = fs.readFileSync(absPath, 'utf8');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    this.deps.emit('error', {
                        message: `Cannot read ${absPath}: ${(error as Error).message}`,
                        phase: 'review',
                    });
                    continue;
                }
                // ENOENT = new file being created — original stays ''
            }

            if (original === artifact.content) continue;

            staged.push({
                path: artifact.path,
                content: artifact.content,
                original,
                diff: this.deps.diffEngine.generateColoredDiff(original, artifact.content),
            });
        }
        return staged;
    }

    /**
     * Present each staged edit to the user for approval and apply approved ones via FileEditTool.
     * No direct fs calls here — all I/O is delegated to fileEditTool.applyEdit().
     */
    private async applyEditsWithApproval(edits: StagedEdit[]): Promise<string[]> {
        this.deps.emit('phase_start', { phase: 'review', description: 'Review proposed changes' });
        const appliedFiles: string[] = [];

        for (const edit of edits) {
            this.deps.emit('diff_proposed', {
                path: edit.path,
                diff: edit.diff,
                original: edit.original,
                proposed: edit.content,
            });

            const approved = await this.deps.onApproval({
                path: edit.path,
                diff: edit.diff,
                original: edit.original,
                proposed: edit.content,
            });

            if (approved) {
                this.fileEditTool.applyEdit(edit);
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
