/**
 * Unit Tests: ExecuteSolverUseCase
 */

import { describe, it, expect, vi } from 'vitest';
import { ExecuteSolverUseCase, ExecuteSolverDeps } from '../../../src/application/use-cases/execute-solver-use-case';
import { LLMController } from '../../../src/infrastructure/api/llm-controller';
import { ToolRegistry } from '../../../src/application/orchestration/tool-registry';
import { DiffEngine } from '../../../src/application/services/diff-engine';
import { Orchestrator, OrchestratorResult } from '../../../src/application/orchestration/orchestrator';
import { EditStagingService, StagedEdit } from '../../../src/application/services/edit-staging-service';
import { Evaluator } from '../../../src/application/services/evaluator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content: '' }),
        streamPrompt: vi.fn().mockResolvedValue({ content: '', usage: { promptTokens: 0, completionTokens: 0 } }),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'test', provider: 'test' }),
    } as unknown as LLMController;
}

function makeMockRegistry(): ToolRegistry {
    return {
        get: vi.fn(),
        register: vi.fn(),
        getSchemas: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;
}

function makeMockDiffEngine(): DiffEngine {
    return {
        generateColoredDiff: vi.fn().mockReturnValue('+ new line'),
    } as unknown as DiffEngine;
}

function makeOrchResult(overrides: Partial<OrchestratorResult> = {}): OrchestratorResult {
    return {
        outputs: [],
        fileChanges: [],
        steps: [],
        subTasksRun: 1,
        usage: { inputTokens: 10, outputTokens: 20, cacheCreationTokens: 0, cacheReadTokens: 0 },
        ...overrides,
    };
}

function makeDeps(overrides: Partial<ExecuteSolverDeps & {
    orchestrator?: Orchestrator;
    stagingService?: EditStagingService;
    evaluator?: Evaluator;
}> = {}): { deps: ExecuteSolverDeps; events: Array<{ type: string; data: Record<string, unknown> }> } {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const emit = (type: string, data: Record<string, unknown>) => events.push({ type, data });

    const orchestrator = overrides.orchestrator ?? {
        run: vi.fn().mockResolvedValue(makeOrchResult()),
    } as unknown as Orchestrator;

    const stagingService = overrides.stagingService ?? {
        drainStagedEdits: vi.fn().mockReturnValue([]),
        stageFromArtifacts: vi.fn().mockReturnValue([]),
        applyEdit: vi.fn(),
    } as unknown as EditStagingService;

    const evaluator = overrides.evaluator ?? {
        validateEditOutput: vi.fn().mockReturnValue({ valid: true, artifacts: [] }),
        retryWithCorrection: vi.fn().mockResolvedValue(''),
    } as unknown as Evaluator;

    const deps: ExecuteSolverDeps = {
        llm: overrides.llm ?? makeMockLLM(),
        registry: overrides.registry ?? makeMockRegistry(),
        diffEngine: overrides.diffEngine ?? makeMockDiffEngine(),
        directory: '/project',
        onApproval: overrides.onApproval ?? vi.fn().mockResolvedValue(true),
        emit,
        orchestrator,
        stagingService,
        evaluator,
    };

    return { deps, events };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecuteSolverUseCase', () => {
    it('returns empty solutionPath when orchestrator produces no edits', async () => {
        const { deps } = makeDeps();
        const useCase = new ExecuteSolverUseCase(deps);

        const result = await useCase.execute('solve this', []);

        expect(result.solutionPath).toBe('');
        expect(result.appliedFiles).toEqual([]);
    });

    it('emits phase_start and phase_end for solver phase', async () => {
        const { deps, events } = makeDeps();
        const useCase = new ExecuteSolverUseCase(deps);

        await useCase.execute('solve this', []);

        const start = events.find(e => e.type === 'phase_start' && e.data.phase === 'solver');
        const end = events.find(e => e.type === 'phase_end' && e.data.phase === 'solver');
        expect(start).toBeDefined();
        expect(end).toBeDefined();
    });

    it('applies approved edits and returns appliedFiles', async () => {
        const stagedEdit: StagedEdit = {
            path: '/project/solution_hw1.R',
            content: 'x <- 1',
            original: '',
            diff: '+ x <- 1',
        };
        const stagingService = {
            drainStagedEdits: vi.fn().mockReturnValue([stagedEdit]),
            stageFromArtifacts: vi.fn().mockReturnValue([]),
            applyEdit: vi.fn(),
        } as unknown as EditStagingService;

        const { deps } = makeDeps({ stagingService, onApproval: vi.fn().mockResolvedValue(true) });
        const useCase = new ExecuteSolverUseCase(deps);

        const result = await useCase.execute('solve this', []);

        expect(result.appliedFiles).toContain('/project/solution_hw1.R');
        expect(result.solutionPath).toBe('/project/solution_hw1.R');
    });

    it('does not apply rejected edits', async () => {
        const stagedEdit: StagedEdit = {
            path: '/project/solution.R',
            content: 'x <- 1',
            original: '',
            diff: '+ x <- 1',
        };
        const stagingService = {
            drainStagedEdits: vi.fn().mockReturnValue([stagedEdit]),
            stageFromArtifacts: vi.fn().mockReturnValue([]),
            applyEdit: vi.fn(),
        } as unknown as EditStagingService;

        const { deps } = makeDeps({ stagingService, onApproval: vi.fn().mockResolvedValue(false) });
        const useCase = new ExecuteSolverUseCase(deps);

        const result = await useCase.execute('solve this', []);

        expect(result.appliedFiles).toEqual([]);
        expect(stagingService.applyEdit).not.toHaveBeenCalled();
    });

    it('emits error event when orchestrator throws', async () => {
        const orchestrator = {
            run: vi.fn().mockRejectedValue(new Error('LLM timeout')),
        } as unknown as Orchestrator;

        const { deps, events } = makeDeps({ orchestrator });
        const useCase = new ExecuteSolverUseCase(deps);

        await expect(useCase.execute('solve this', [])).rejects.toThrow();

        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent?.data.message).toContain('LLM timeout');
        expect(errorEvent?.data.phase).toBe('solver');
    });
});
