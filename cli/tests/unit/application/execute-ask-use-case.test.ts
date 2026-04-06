/**
 * Unit Tests: ExecuteAskUseCase
 *
 * No real LLM calls or filesystem I/O — all external dependencies are mocked
 * via vi.mock() or injected through ExecuteAskDeps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteAskUseCase, ExecuteAskDeps } from '../../../src/application/use-cases/execute-ask-use-case';
import { LLMController } from '../../../src/infrastructure/api/llm-controller';
import { ToolRegistry } from '../../../src/application/orchestration/tool-registry';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(content = 'LLM answer'): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content }),
        streamPrompt: vi.fn().mockResolvedValue({
            content,
            usage: { promptTokens: 10, completionTokens: 20 },
        }),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'test-model', provider: 'test' }),
    } as unknown as LLMController;
}

function makeMockScanTool(files: Record<string, Array<{ name: string; path: string }>> = {}) {
    return {
        name: 'file_scan',
        execute: vi.fn().mockResolvedValue({
            content: 'scan result',
            isError: false,
            data: { files },
        }),
    };
}

function makeMockReadTool(content = 'file content') {
    return {
        name: 'file_read',
        execute: vi.fn().mockResolvedValue({ content, isError: false }),
    };
}

function makeMockRegistry(tools: Record<string, ReturnType<typeof makeMockScanTool>> = {}): ToolRegistry {
    return {
        get: vi.fn((name: string) => tools[name] ?? undefined),
        register: vi.fn(),
        getSchemas: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;
}

function makeDeps(overrides: Partial<ExecuteAskDeps> = {}) {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const llm = overrides.llm ?? makeMockLLM();
    const registry = overrides.registry ?? makeMockRegistry();

    const deps: ExecuteAskDeps = {
        llm,
        registry,
        directory: '/project',
        emit: (type, data) => events.push({ type, data }),
        ...overrides,
    };

    return { deps, events, llm, registry };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecuteAskUseCase', () => {
    describe('execute() — casual / short messages', () => {
        it('skips workspace scan for short casual messages', async () => {
            const scanTool = makeMockScanTool();
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('hi', []);

            expect(scanTool.execute).not.toHaveBeenCalled();
        });

        it('skips workspace scan for conversation-history questions', async () => {
            const scanTool = makeMockScanTool();
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('what did we talk about last time?', []);

            expect(scanTool.execute).not.toHaveBeenCalled();
        });
    });

    describe('execute() — workspace scan', () => {
        it('calls file_scan for non-casual instructions', async () => {
            const scanTool = makeMockScanTool();
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('explain the regression function in analysis.R', []);

            expect(scanTool.execute).toHaveBeenCalledOnce();
        });

        it('emits phase_start and phase_end for scan phase', async () => {
            const { deps, events } = makeDeps({
                registry: makeMockRegistry({ file_scan: makeMockScanTool() }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('explain the code', []);

            expect(events.find(e => e.type === 'phase_start' && e.data.phase === 'scan')).toBeDefined();
            expect(events.find(e => e.type === 'phase_end'  && e.data.phase === 'scan')).toBeDefined();
        });

        it('continues gracefully when file_scan tool is not registered', async () => {
            const { deps } = makeDeps({ registry: makeMockRegistry() });
            const useCase = new ExecuteAskUseCase(deps);

            await expect(useCase.execute('what does the code do?', [])).resolves.toBeDefined();
        });

        it('emits status_update warning when scan throws', async () => {
            const scanTool = { name: 'file_scan', execute: vi.fn().mockRejectedValue(new Error('scan fail')) };
            const { deps, events } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('explain the code', []);

            const warning = events.find(
                e => e.type === 'status_update' && String(e.data.warning ?? '').includes('scan failed'),
            );
            expect(warning).toBeDefined();
        });
    });

    describe('execute() — file reading', () => {
        it('reads files whose name appears in the instruction', async () => {
            const readTool = makeMockReadTool('x <- 1');
            const scanTool = makeMockScanTool({
                rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }],
            });
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool, file_read: readTool }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('explain the code in hw11.R', []);

            expect(readTool.execute).toHaveBeenCalledWith({ path: '/project/hw11.R' });
        });

        it('does not read files unrelated to the instruction', async () => {
            const readTool = makeMockReadTool();
            const scanTool = makeMockScanTool({
                rScripts: [{ name: 'unrelated.R', path: '/project/unrelated.R' }],
            });
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool, file_read: readTool }),
            });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('what is linear regression?', []);

            expect(readTool.execute).not.toHaveBeenCalled();
        });
    });

    describe('execute() — LLM streaming', () => {
        it('emits stream_token events during streaming', async () => {
            const llm = makeMockLLM();
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockImplementation(
                async (_req: unknown, onToken: (t: string) => void) => {
                    onToken('Hello');
                    onToken(' world');
                    return { content: 'Hello world', usage: { promptTokens: 5, completionTokens: 5 } };
                },
            );
            const { deps, events } = makeDeps({ llm });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('explain the code', []);

            const tokenEvents = events.filter(e => e.type === 'stream_token');
            expect(tokenEvents.length).toBeGreaterThan(0);
        });

        it('emits text_output with the LLM response content', async () => {
            const { deps, events } = makeDeps({ llm: makeMockLLM('The answer is 42.') });
            const useCase = new ExecuteAskUseCase(deps);

            await useCase.execute('what is the answer?', []);

            const textEvent = events.find(e => e.type === 'text_output');
            expect(textEvent?.data.content).toBe('The answer is 42.');
        });

        it('returns content and usage in AskResult', async () => {
            const { deps } = makeDeps({ llm: makeMockLLM('result text') });
            const useCase = new ExecuteAskUseCase(deps);

            const result = await useCase.execute('explain', []);

            expect(result.content).toBe('result text');
            expect(result.usage).toBeDefined();
            expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0);
        });

        it('emits error and rethrows when streamPrompt throws', async () => {
            const llm = makeMockLLM();
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));
            const { deps, events } = makeDeps({ llm });
            const useCase = new ExecuteAskUseCase(deps);

            await expect(useCase.execute('explain the code', [])).rejects.toThrow('API down');

            const errorEvent = events.find(e => e.type === 'error');
            expect(errorEvent?.data.phase).toBe('ask');
        });
    });

    describe('execute() — previousSessionSummary', () => {
        it('accepts a previousSessionSummary without throwing', async () => {
            const { deps } = makeDeps();
            const useCase = new ExecuteAskUseCase(deps);

            await expect(
                useCase.execute('explain something', [], 'Previously we discussed linear models.'),
            ).resolves.toBeDefined();
        });
    });
});
