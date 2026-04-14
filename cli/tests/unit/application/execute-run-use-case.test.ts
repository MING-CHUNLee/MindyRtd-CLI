/**
 * Unit Tests: ExecuteRunUseCase
 *
 * No real R execution or LLM calls — all external dependencies are mocked.
 * Covers script discovery, execution routing, and the analysis streaming path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteRunUseCase, ExecuteRunDeps } from '../../../src/application/use-cases/execute-run-use-case';
import { LLMController } from '../../../src/infrastructure/api';
import { ToolRegistry } from '../../../src/application/orchestration/tool-registry';
import type { RBridgePort } from '../../../src/application/ports/r-bridge-port';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(content = 'Analysis result'): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content }),
        streamPrompt: vi.fn().mockResolvedValue({
            content,
            usage: { promptTokens: 10, completionTokens: 20 },
        }),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'test', provider: 'test' }),
    } as unknown as LLMController;
}

function makeScanTool(files: Record<string, Array<{ name: string; path: string }>> = {}) {
    return {
        name: 'file_scan',
        execute: vi.fn().mockResolvedValue({ content: '', isError: false, data: { files } }),
    };
}

function makeExecTool(output = 'R output here') {
    return {
        name: 'r_exec',
        execute: vi.fn().mockResolvedValue({ content: output, isError: false }),
    };
}

function makeRenderTool(output = 'Rmd render output') {
    return {
        name: 'r_render',
        execute: vi.fn().mockResolvedValue({ content: output, isError: false }),
    };
}

function makeMockRegistry(tools: Record<string, { name: string; execute: ReturnType<typeof vi.fn> }> = {}): ToolRegistry {
    return {
        get: vi.fn((name: string) => tools[name] ?? undefined),
        register: vi.fn(),
        getSchemas: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;
}

function makeMockBridge(overrides: Partial<RBridgePort> & { activeFile?: string | null } = {}): RBridgePort {
    const activeFile = overrides.activeFile ?? '/project/active.R';
    return {
        isListenerRunning: vi.fn().mockReturnValue(true),
        getCurrentFile: vi.fn().mockResolvedValue(activeFile),
        runCurrentFile: vi.fn().mockResolvedValue({ id: '1', status: 'completed', output: 'bridge output' }),
        ...overrides,
    } as unknown as RBridgePort;
}

function makeDeps(overrides: Partial<ExecuteRunDeps> = {}) {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const deps: ExecuteRunDeps = {
        llm: overrides.llm ?? makeMockLLM(),
        registry: overrides.registry ?? makeMockRegistry(),
        directory: '/project',
        emit: (type, data) => events.push({ type, data }),
        ...overrides,
    };
    return { deps, events };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecuteRunUseCase', () => {
    describe('execute() — no script found', () => {
        it('returns scriptPath: null without calling LLM when no script is found', async () => {
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: makeScanTool() }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run hw11.R', []);

            expect(result.scriptPath).toBeNull();
            expect(deps.llm.streamPrompt).not.toHaveBeenCalled();
        });

        it('emits text_output with a helpful message when no script is found', async () => {
            const { deps, events } = makeDeps({
                registry: makeMockRegistry({ file_scan: makeScanTool() }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            await useCase.execute('run hw11.R', []);

            const textEvent = events.find(e => e.type === 'text_output');
            expect(String(textEvent?.data.content ?? '')).toContain('No matching R or Rmd file found');
        });
    });

    describe('execute() — .R script found via scan', () => {
        it('runs the script via r_exec and streams analysis', async () => {
            const execTool = makeExecTool('[1] 42');
            const scanTool = makeScanTool({
                rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }],
            });
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool, r_exec: execTool }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run hw11.R', []);

            expect(execTool.execute).toHaveBeenCalledOnce();
            expect(result.scriptPath).toBe('/project/hw11.R');
            expect(result.execOutput).toBe('[1] 42');
        });

        it('emits phase_start/phase_end for scan, run, analyze phases', async () => {
            const { deps, events } = makeDeps({
                registry: makeMockRegistry({
                    file_scan: makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] }),
                    r_exec: makeExecTool(),
                }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            await useCase.execute('run hw11.R', []);

            for (const phase of ['scan', 'run', 'analyze']) {
                expect(events.find(e => e.type === 'phase_start' && e.data.phase === phase)).toBeDefined();
                expect(events.find(e => e.type === 'phase_end'  && e.data.phase === phase)).toBeDefined();
            }
        });

        it('returns the analysis content from the LLM', async () => {
            const { deps } = makeDeps({
                llm: makeMockLLM('Script ran successfully and printed 42.'),
                registry: makeMockRegistry({
                    file_scan: makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] }),
                    r_exec: makeExecTool('[1] 42'),
                }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run hw11.R', []);

            expect(result.analysis).toBe('Script ran successfully and printed 42.');
        });
    });

    describe('execute() — .Rmd script found via scan', () => {
        it('uses r_render tool for .Rmd files', async () => {
            const renderTool = makeRenderTool('Rmd output');
            const scanTool = makeScanTool({
                rMarkdown: [{ name: 'report.Rmd', path: '/project/report.Rmd' }],
            });
            const { deps } = makeDeps({
                registry: makeMockRegistry({ file_scan: scanTool, r_render: renderTool }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('render report.Rmd', []);

            expect(renderTool.execute).toHaveBeenCalledOnce();
            expect(result.execOutput).toBe('Rmd output');
        });
    });

    describe('execute() — RBridge-aware routing', () => {
        it('uses RBridge.runCurrentFile for generic run when listener is running and active file is available', async () => {
            const bridge = makeMockBridge({ activeFile: '/project/active.R' });
            const registry = makeMockRegistry({
                file_scan: makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] }),
                r_exec: makeExecTool('[1] 42'),
            });
            const { deps } = makeDeps({ rBridge: bridge, registry });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run', []);

            expect(bridge.getCurrentFile).toHaveBeenCalledOnce();
            expect(bridge.runCurrentFile).toHaveBeenCalledOnce();
            expect((registry.get as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith('r_exec');
            expect(result.scriptPath).toBe('/project/active.R');
            expect(result.execOutput).toBe('bridge output');
        });

        it('falls back to r_exec when the instruction names a different file than the active RStudio file', async () => {
            const bridge = makeMockBridge({ activeFile: '/project/active.R' });
            const execTool = makeExecTool('[1] 42');
            const scanTool = makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] });
            const registry = makeMockRegistry({ file_scan: scanTool, r_exec: execTool });
            const { deps } = makeDeps({ rBridge: bridge, registry });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run hw11.R', []);

            expect(bridge.getCurrentFile).toHaveBeenCalledOnce();
            expect(bridge.runCurrentFile).not.toHaveBeenCalled();
            expect(execTool.execute).toHaveBeenCalledOnce();
            expect(result.scriptPath).toBe('/project/hw11.R');
        });

        it('uses RBridge.runCurrentFile when the instruction names the active file', async () => {
            const bridge = makeMockBridge({ activeFile: '/project/active.R' });
            const registry = makeMockRegistry({
                file_scan: makeScanTool({ rScripts: [{ name: 'active.R', path: '/project/active.R' }] }),
                r_exec: makeExecTool('[1] 42'),
            });
            const { deps } = makeDeps({ rBridge: bridge, registry });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run active.R', []);

            expect(bridge.runCurrentFile).toHaveBeenCalledOnce();
            expect(result.scriptPath).toBe('/project/active.R');
        });

        it('falls back to scan when listener is running but no active file is available', async () => {
            const bridge = makeMockBridge({ activeFile: null });
            const execTool = makeExecTool('[1] 42');
            const scanTool = makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] });
            const registry = makeMockRegistry({ file_scan: scanTool, r_exec: execTool });
            const { deps } = makeDeps({ rBridge: bridge, registry });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run hw11.R', []);

            expect(bridge.getCurrentFile).toHaveBeenCalledOnce();
            expect(bridge.runCurrentFile).not.toHaveBeenCalled();
            expect(execTool.execute).toHaveBeenCalledOnce();
            expect(result.scriptPath).toBe('/project/hw11.R');
        });
    });

    describe('execute() — LLM analysis failure', () => {
        it('emits error event and rethrows when streamPrompt throws', async () => {
            const llm = makeMockLLM();
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM timeout'));
            const { deps, events } = makeDeps({
                llm,
                registry: makeMockRegistry({
                    file_scan: makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] }),
                    r_exec: makeExecTool(),
                }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            await expect(useCase.execute('run hw11.R', [])).rejects.toThrow('LLM timeout');

            const errorEvent = events.find(e => e.type === 'error');
            expect(errorEvent?.data.phase).toBe('analyze');
        });
    });

    describe('execute() — usage tracking', () => {
        it('accumulates token usage from the LLM response', async () => {
            const llm = makeMockLLM();
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
                content: 'analysis',
                usage: { promptTokens: 50, completionTokens: 30 },
            });
            const { deps } = makeDeps({
                llm,
                registry: makeMockRegistry({
                    file_scan: makeScanTool({ rScripts: [{ name: 'hw11.R', path: '/project/hw11.R' }] }),
                    r_exec: makeExecTool(),
                }),
            });
            const useCase = new ExecuteRunUseCase(deps);

            const result = await useCase.execute('run hw11.R', []);

            expect(result.usage.inputTokens).toBe(50);
            expect(result.usage.outputTokens).toBe(30);
        });
    });
});
