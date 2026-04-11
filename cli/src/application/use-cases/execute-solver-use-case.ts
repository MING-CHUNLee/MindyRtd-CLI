/**
 * Use Case: ExecuteSolverUseCase
 *
 * Solver workflow mode pipeline:
 *   1. Scan workspace for context
 *   2. Run ReAct loop with the solver system prompt
 *   3. Present proposed edits through the approval gate
 *   4. Write approved solution file(s)
 *
 * Returns SolverResult — the caller is responsible for persisting the turn.
 */

import { LLMGateway } from '../../domain/types/llm-gateway';
import { IFileSystem } from '../../domain/types/file-system';
import { LocalFileSystem } from '../../infrastructure/filesystem/local-file-system';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { ToolRegistry } from '../orchestration/tool-registry';
import { DiffEngine } from '../services/diff-engine';
import { SessionMessage } from '../../shared/types/messages';
import { Orchestrator, OrchestratorResult } from '../orchestration/orchestrator';
import { LLMOutput } from '../../domain/values/llm-output';
import { Evaluator } from '../services/evaluator';
import { buildSolverAgentPrompt } from '../prompts/solver-agent';
import { EditStagingService, StagedEdit } from '../services/edit-staging-service';
import { LLMRequestPayload } from '../../shared/types/llm-types';

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteSolverDeps {
    llm: LLMGateway;
    registry: ToolRegistry;
    diffEngine: DiffEngine;
    directory: string;
    onApproval: (edit: { path: string; diff: string; original: string; proposed: string }) => Promise<boolean>;
    emit: EmitFn;
    evaluator?: Evaluator;
    orchestrator?: Orchestrator;
    stagingService?: EditStagingService;
    fileSystem?: IFileSystem;
}

export interface SolverResult {
    solutionPath: string;
    appliedFiles: string[];
    outputs: LLMOutput[];
    usage: TurnUsage;
}

// ── ExecuteSolverUseCase ──────────────────────────────────────────────────────

export class ExecuteSolverUseCase {
    private readonly evaluator: Evaluator;
    private readonly orchestrator: Orchestrator;
    private readonly stagingService: EditStagingService;

    constructor(private readonly deps: ExecuteSolverDeps) {
        this.evaluator = deps.evaluator ?? new Evaluator();
        this.orchestrator = deps.orchestrator ?? new Orchestrator(deps.llm, deps.registry);
        const fileSystem = deps.fileSystem ?? new LocalFileSystem();
        this.stagingService = deps.stagingService ?? new EditStagingService(fileSystem, deps.diffEngine);
    }

    async execute(instruction: string, history: SessionMessage[]): Promise<SolverResult> {
        const { orchResult, baseRequest } = await this.runOrchestration(instruction, history);
        const { validatedEdits, outputs } = await this.validateArtifacts(orchResult, baseRequest);

        const toolStagedEdits = this.stagingService.drainStagedEdits();
        const artifactEdits = this.stagingService.stageFromArtifacts(validatedEdits, this.deps.directory, this.deps.emit);
        const allEdits = [...toolStagedEdits, ...artifactEdits];

        if (allEdits.length === 0) {
            return { solutionPath: '', appliedFiles: [], outputs, usage: orchResult.usage };
        }

        const appliedFiles = await this.applyEditsWithApproval(allEdits);
        const solutionPath = appliedFiles[0] ?? '';
        return { solutionPath, appliedFiles, outputs, usage: orchResult.usage };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async runOrchestration(
        instruction: string,
        history: SessionMessage[],
    ): Promise<{ orchResult: OrchestratorResult; baseRequest: LLMRequestPayload }> {
        this.deps.emit('phase_start', { phase: 'solver', description: 'Generating solution (solver mode)' });

        const toolsText = this.buildToolsText();
        const systemPrompt = buildSolverAgentPrompt(this.deps.directory, toolsText);

        const baseRequest: LLMRequestPayload = {
            systemPrompt,
            userMessage: instruction,
            history,
            model: undefined,
        };

        try {
            const orchResult = await this.orchestrator.run(baseRequest, instruction);
            this.deps.emit('phase_end', {
                phase: 'solver',
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
            this.deps.emit('phase_end', { phase: 'solver', success: false });
            this.deps.emit('error', {
                message: error instanceof Error ? error.message : String(error),
                phase: 'solver',
            });
            throw error;
        }
    }

    private async validateArtifacts(
        orchResult: OrchestratorResult,
        baseRequest: LLMRequestPayload,
    ): Promise<{ validatedEdits: Array<{ path: string; content: string }>; outputs: LLMOutput[] }> {
        for (const output of orchResult.outputs) {
            this.deps.emit('text_output', { content: output.content });
        }

        const validatedEdits: Array<{ path: string; content: string }> = [];
        for (const fc of orchResult.fileChanges) {
            const validation = this.evaluator.validateEditOutput(fc.content);
            if (validation.valid && validation.artifacts) {
                validatedEdits.push(...validation.artifacts);
            } else {
                const corrected = await this.evaluator.retryWithCorrection(this.deps.llm, baseRequest, fc.content);
                const retryValidation = this.evaluator.validateEditOutput(corrected);
                if (retryValidation.valid && retryValidation.artifacts) {
                    validatedEdits.push(...retryValidation.artifacts);
                } else {
                    validatedEdits.push({ path: fc.path, content: fc.content });
                }
            }
        }

        return { validatedEdits, outputs: orchResult.outputs };
    }

    private async applyEditsWithApproval(edits: StagedEdit[]): Promise<string[]> {
        this.deps.emit('phase_start', { phase: 'review', description: 'Review proposed solution' });
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
                this.stagingService.applyEdit(edit);
                this.deps.emit('edit_applied', { path: edit.path });
                appliedFiles.push(edit.path);
            } else {
                this.deps.emit('edit_rejected', { path: edit.path });
            }
        }

        this.deps.emit('phase_end', { phase: 'review', success: true });
        return appliedFiles;
    }

    private buildToolsText(): string {
        return this.deps.registry.getSchemas().map(schema => {
            const params = Object.entries(schema.parameters)
                .map(([k, v]) => `    - ${k} (${v.type}${v.required ? ', required' : ''}): ${v.description}`)
                .join('\n');
            return `- ${schema.name}: ${schema.description}\n  Parameters:\n${params}` +
                (schema.example ? `\n  Example: ${schema.example}` : '');
        }).join('\n\n');
    }
}
