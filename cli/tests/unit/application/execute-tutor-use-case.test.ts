/**
 * Unit Tests: ExecuteTutorUseCase
 */

import { describe, it, expect, vi } from 'vitest';
import { ExecuteTutorUseCase, ExecuteTutorDeps } from '../../../src/application/use-cases/execute-tutor-use-case';
import { LLMController } from '../../../src/infrastructure/api/llm-controller';
import { ToolRegistry } from '../../../src/application/orchestration/tool-registry';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(content = 'Tutor response'): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content }),
        streamPrompt: vi.fn().mockResolvedValue({
            content,
            usage: { promptTokens: 10, completionTokens: 20 },
        }),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'test', provider: 'test' }),
    } as unknown as LLMController;
}

function makeMockRegistry(): ToolRegistry {
    return {
        get: vi.fn().mockReturnValue(undefined),
        register: vi.fn(),
        getSchemas: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;
}

function makeDeps(overrides: Partial<ExecuteTutorDeps> = {}): {
    deps: ExecuteTutorDeps;
    events: Array<{ type: string; data: Record<string, unknown> }>;
} {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const emit = (type: string, data: Record<string, unknown>) => events.push({ type, data });

    const deps: ExecuteTutorDeps = {
        llm: overrides.llm ?? makeMockLLM(),
        registry: overrides.registry ?? makeMockRegistry(),
        directory: '/project',
        emit,
    };

    return { deps, events };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecuteTutorUseCase (socratic)', () => {
    it('streams response and returns content', async () => {
        const { deps } = makeDeps({ llm: makeMockLLM('What do you think the answer might be?') });
        const useCase = new ExecuteTutorUseCase(deps, 'socratic');

        const result = await useCase.execute('solve my homework', []);

        expect(result.content).toBe('What do you think the answer might be?');
    });

    it('emits text_output with LLM content', async () => {
        const { deps, events } = makeDeps({ llm: makeMockLLM('What have you tried so far?') });
        const useCase = new ExecuteTutorUseCase(deps, 'socratic');

        await useCase.execute('solve hw1', []);

        const textEvent = events.find(e => e.type === 'text_output');
        expect(textEvent?.data.content).toBe('What have you tried so far?');
    });

    it('emits phase_start and phase_end for tutor phase', async () => {
        const { deps, events } = makeDeps();
        const useCase = new ExecuteTutorUseCase(deps, 'socratic');

        await useCase.execute('explain this', []);

        const start = events.find(e => e.type === 'phase_start' && e.data.phase === 'tutor');
        const end = events.find(e => e.type === 'phase_end' && e.data.phase === 'tutor');
        expect(start).toBeDefined();
        expect(end).toBeDefined();
    });

    it('emits error event when streamPrompt throws', async () => {
        const llm = makeMockLLM();
        (llm.streamPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
        const { deps, events } = makeDeps({ llm });
        const useCase = new ExecuteTutorUseCase(deps, 'socratic');

        await expect(useCase.execute('help', [])).rejects.toThrow();

        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent?.data.message).toContain('API error');
        expect(errorEvent?.data.phase).toBe('tutor');
    });
});

describe('ExecuteTutorUseCase (guide)', () => {
    it('returns guide-style content', async () => {
        const { deps } = makeDeps({ llm: makeMockLLM('Step 1: Understand the problem') });
        const useCase = new ExecuteTutorUseCase(deps, 'guide');

        const result = await useCase.execute('solve hw2', []);

        expect(result.content).toBe('Step 1: Understand the problem');
    });

    it('emits stream_token during guide mode', async () => {
        const llm = makeMockLLM();
        (llm.streamPrompt as ReturnType<typeof vi.fn>).mockImplementation(
            async (_req: unknown, onToken: (t: string) => void) => {
                onToken('Step 1');
                return { content: 'Step 1', usage: { promptTokens: 5, completionTokens: 5 } };
            },
        );
        const { deps, events } = makeDeps({ llm });
        const useCase = new ExecuteTutorUseCase(deps, 'guide');

        await useCase.execute('help me with hw3', []);

        const tokenEvents = events.filter(e => e.type === 'stream_token');
        expect(tokenEvents.length).toBeGreaterThan(0);
    });
});
