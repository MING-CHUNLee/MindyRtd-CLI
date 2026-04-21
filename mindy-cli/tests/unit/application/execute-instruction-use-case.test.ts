/**
 * Unit Tests: ExecuteInstructionUseCase
 *
 * All external dependencies (Orchestrator, EditStagingService, Evaluator,
 * KnowledgeBase, LLMController, KnowledgeRepository) are mocked via vi.mock()
 * or injected via the deps object — no real LLM calls or fs I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ExecuteInstructionUseCase,
    ExecuteInstructionDeps,
} from '../../../src/application/use-cases/execute-instruction-use-case';
import { LLMController } from '../../../src/infrastructure/api';
import { ToolRegistry } from '../../../src/application/orchestration/tool-registry';
import { DiffEngine } from '../../../src/application/services/diff-engine';
import { EditStagingService, StagedEdit } from '../../../src/application/services/edit-staging-service';
import { Orchestrator, OrchestratorResult } from '../../../src/application/orchestration/orchestrator';
import { Evaluator } from '../../../src/application/services/evaluator';
import { KnowledgeBase } from '../../../src/application/services/knowledge-base';
import { IFileSystem } from '../../../src/domain/types/file-system';

// ── Module-level mocks (prevent real infra being imported) ─────────────────────

vi.mock('../../../src/infrastructure/persistence/knowledge-repository', () => ({
    KnowledgeRepository: vi.fn(function () {
        return { load: vi.fn().mockReturnValue([]) };
    }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content: '' }),
        streamPrompt: vi.fn().mockResolvedValue({ content: '', usage: {} }),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'test-model', provider: 'test' }),
    } as unknown as LLMController;
}

function makeMockRegistry(): ToolRegistry {
    return {
        get: vi.fn().mockReturnValue(undefined),
        register: vi.fn(),
        getSchemas: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;
}

function makeMockDiffEngine(): DiffEngine {
    return {
        generateColoredDiff: vi.fn().mockReturnValue('+ new\n- old\n'),
    } as unknown as DiffEngine;
}

function makeMockFs(): IFileSystem {
    return {
        exists: vi.fn().mockReturnValue(false),
        read: vi.fn().mockReturnValue('original content\n'),
        write: vi.fn(),
        mkdir: vi.fn(),
        stat: vi.fn(),
    } as unknown as IFileSystem;
}

const MOCK_STAGED_EDIT: StagedEdit = {
    path: 'analysis.R',
    content: 'x <- 2\n',
    original: 'x <- 1\n',
    diff: '+ x <- 2\n- x <- 1\n',
};

function makeMockStagingService(opts: {
    toolStagedEdits?: StagedEdit[];
    artifactStagedEdits?: StagedEdit[];
} = {}): EditStagingService {
    return {
        stage: vi.fn().mockReturnValue({ staged: MOCK_STAGED_EDIT }),
        drainStagedEdits: vi.fn().mockReturnValue(opts.toolStagedEdits ?? []),
        stageFromArtifacts: vi.fn().mockReturnValue(opts.artifactStagedEdits ?? []),
        applyEdit: vi.fn(),
    } as unknown as EditStagingService;
}

function makeMockOrchestrator(result: Partial<OrchestratorResult> = {}): Orchestrator {
    const defaults: OrchestratorResult = {
        steps: [],
        fileChanges: [],
        outputs: [],
        usage: { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 },
        subTasksRun: 1,
    };
    return {
        run: vi.fn().mockResolvedValue({ ...defaults, ...result }),
    } as unknown as Orchestrator;
}

function makeMockEvaluator(valid = true): Evaluator {
    return {
        validateEditOutput: vi.fn().mockReturnValue({ valid, artifacts: [] }),
        retryWithCorrection: vi.fn().mockResolvedValue(''),
    } as unknown as Evaluator;
}

function makeMockKnowledgeBase(): KnowledgeBase {
    return {
        load: vi.fn(),
        retrieve: vi.fn().mockReturnValue([]),
    } as unknown as KnowledgeBase;
}

function makeDeps(overrides: Partial<ExecuteInstructionDeps> = {}): {
    deps: ExecuteInstructionDeps;
    events: Array<{ type: string; data: Record<string, unknown> }>;
    stagingService: EditStagingService;
    orchestrator: Orchestrator;
    onApproval: ReturnType<typeof vi.fn>;
} {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const stagingService = overrides.stagingService ?? makeMockStagingService();
    const orchestrator = overrides.orchestrator ?? makeMockOrchestrator();
    const onApproval = vi.fn().mockResolvedValue(true);

    const deps: ExecuteInstructionDeps = {
        llm: makeMockLLM(),
        registry: makeMockRegistry(),
        diffEngine: makeMockDiffEngine(),
        directory: '/project',
        onApproval,
        emit: (type, data) => events.push({ type, data }),
        knowledgeBase: makeMockKnowledgeBase(),
        evaluator: makeMockEvaluator(),
        stagingService,
        orchestrator,
        fileSystem: makeMockFs(),
        ...overrides,
    };

    return { deps, events, stagingService, orchestrator, onApproval };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecuteInstructionUseCase', () => {
    describe('execute() — orchestration failure', () => {
        it('throws and emits phase_end + error when orchestrator.run() rejects', async () => {
            const { deps, events } = makeDeps({
                orchestrator: {
                    run: vi.fn().mockRejectedValue(new Error('LLM timeout')),
                } as unknown as Orchestrator,
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await expect(useCase.execute('fix the code', [])).rejects.toThrow('Orchestration failed');

            const phaseEnd = events.find(e => e.type === 'phase_end' && e.data.phase === 'orchestrator');
            expect(phaseEnd?.data.success).toBe(false);

            const errorEvent = events.find(e => e.type === 'error');
            expect(errorEvent?.data.message).toContain('LLM timeout');
        });
    });

    describe('execute() — analysis-only response (no edits)', () => {
        it('returns analysisSummary and empty appliedFiles when no edits are staged', async () => {
            const { deps } = makeDeps({
                orchestrator: makeMockOrchestrator({
                    outputs: [{ content: 'Analysis complete.', type: 'analysis' } as any],
                    fileChanges: [],
                }),
                stagingService: makeMockStagingService({
                    toolStagedEdits: [],
                    artifactStagedEdits: [],
                }),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            const result = await useCase.execute('explain this code', []);

            expect(result.appliedFiles).toHaveLength(0);
            expect(result.analysisSummary).toContain('Analysis complete.');
        });

        it('falls back to "No changes generated." when outputs are also empty', async () => {
            const { deps } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [], artifactStagedEdits: [] }),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            const result = await useCase.execute('explain', []);

            expect(result.analysisSummary).toBe('No changes generated.');
        });
    });

    describe('execute() — edit approved', () => {
        it('calls stagingService.applyEdit() when user approves', async () => {
            const { deps, stagingService } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
                onApproval: vi.fn().mockResolvedValue(true),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('fix analysis.R', []);

            expect(stagingService.applyEdit).toHaveBeenCalledWith(MOCK_STAGED_EDIT);
        });

        it('emits edit_applied with the correct path when approved', async () => {
            const { deps, events } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
                onApproval: vi.fn().mockResolvedValue(true),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('fix analysis.R', []);

            const applied = events.find(e => e.type === 'edit_applied');
            expect(applied?.data.path).toBe('analysis.R');
        });

        it('includes the file path in appliedFiles', async () => {
            const { deps } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
                onApproval: vi.fn().mockResolvedValue(true),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            const result = await useCase.execute('fix analysis.R', []);

            expect(result.appliedFiles).toContain('analysis.R');
        });
    });

    describe('execute() — edit rejected', () => {
        it('does NOT call stagingService.applyEdit() when user rejects', async () => {
            const { deps, stagingService } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
                onApproval: vi.fn().mockResolvedValue(false),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('fix analysis.R', []);

            expect(stagingService.applyEdit).not.toHaveBeenCalled();
        });

        it('emits edit_rejected with the correct path', async () => {
            const { deps, events } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
                onApproval: vi.fn().mockResolvedValue(false),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('fix analysis.R', []);

            const rejected = events.find(e => e.type === 'edit_rejected');
            expect(rejected?.data.path).toBe('analysis.R');
        });

        it('returns empty appliedFiles when all edits are rejected', async () => {
            const { deps } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
                onApproval: vi.fn().mockResolvedValue(false),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            const result = await useCase.execute('fix analysis.R', []);

            expect(result.appliedFiles).toHaveLength(0);
        });
    });

    describe('execute() — onApproval callback contract', () => {
        it('calls onApproval with path, diff, original, and proposed', async () => {
            const { deps, onApproval } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [MOCK_STAGED_EDIT] }),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('fix analysis.R', []);

            expect(onApproval).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: MOCK_STAGED_EDIT.path,
                    diff: MOCK_STAGED_EDIT.diff,
                    original: MOCK_STAGED_EDIT.original,
                    proposed: MOCK_STAGED_EDIT.content,
                }),
            );
        });
    });

    describe('execute() — phase events', () => {
        it('emits phase_start for orchestrator at the beginning', async () => {
            const { deps, events } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [], artifactStagedEdits: [] }),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('do something', []);

            const phaseStart = events.find(e => e.type === 'phase_start' && e.data.phase === 'orchestrator');
            expect(phaseStart).toBeDefined();
        });

        it('emits phase_end with success:true after orchestrator completes', async () => {
            const { deps, events } = makeDeps({
                stagingService: makeMockStagingService({ toolStagedEdits: [], artifactStagedEdits: [] }),
            });
            const useCase = new ExecuteInstructionUseCase(deps);

            await useCase.execute('do something', []);

            const phaseEnd = events.find(e => e.type === 'phase_end' && e.data.phase === 'orchestrator');
            expect(phaseEnd?.data.success).toBe(true);
        });
    });
});
