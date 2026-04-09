/**
 * Unit Tests: FileResolver
 *
 * Verifies that FileResolver delegates scanning to FileFinder and
 * LLM resolution to LLMController, then maps the result correctly.
 *
 * Both dependencies are injected as mocks — no filesystem or network I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileResolver, ResolvedFile } from '../../../src/infrastructure/filesystem/file-resolver';
import { FileFinder } from '../../../src/infrastructure/filesystem/file-finder';
import { LLMController } from '../../../src/infrastructure/api/llm';

// ── helpers ────────────────────────────────────────────────────────────────

function makeFinder(previews: { path: string; preview: string }[]): FileFinder {
    return { scan: vi.fn().mockResolvedValue(previews) } as unknown as FileFinder;
}

function makeClient(targets: string[]): LLMController {
    return {
        resolveFiles: vi.fn().mockResolvedValue({ targets }),
    } as unknown as LLMController;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('FileResolver', () => {
    describe('resolve()', () => {
        it('returns empty array when FileFinder finds no files', async () => {
            const resolver = new FileResolver(makeClient([]), makeFinder([]));

            const result = await resolver.resolve('add error handling');

            expect(result).toEqual([]);
        });

        it('delegates scanning to FileFinder with correct args', async () => {
            const finder = makeFinder([]);
            const resolver = new FileResolver(makeClient([]), finder);

            await resolver.resolve('instruction', { workspaceDir: '/proj', maxFiles: 10 });

            // resolve() converts to absolute — on Windows '/proj' → 'C:\proj'
            // so we just assert the resolved path ends with 'proj'
            const [calledDir, calledMax] = (finder.scan as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(calledDir).toMatch(/proj$/);
            expect(calledMax).toBe(10);
        });

        it('passes previews and instruction to LLMController.resolveFiles', async () => {
            const previews = [{ path: 'a.R', preview: 'x <- 1' }];
            const client = makeClient(['a.R']);
            const resolver = new FileResolver(client, makeFinder(previews));

            await resolver.resolve('fix bugs', { workspaceDir: '/proj' });

            expect(client.resolveFiles).toHaveBeenCalledWith(
                'fix bugs',
                [{ path: 'a.R', content: 'x <- 1' }],
            );
        });

        it('maps LLM-returned relative paths to absolute + relative pair', async () => {
            const finder = makeFinder([{ path: 'script.R', preview: '' }]);
            const client = makeClient(['script.R']);
            const resolver = new FileResolver(client, finder);

            const result: ResolvedFile[] = await resolver.resolve('fix', {
                workspaceDir: '/proj',
            });

            expect(result).toHaveLength(1);
            expect(result[0].relativePath).toBe('script.R');
            expect(result[0].absolutePath).toContain('script.R');
        });

        it('returns multiple resolved files when LLM selects several', async () => {
            const previews = [
                { path: 'a.R', preview: '' },
                { path: 'b.R', preview: '' },
            ];
            const resolver = new FileResolver(makeClient(['a.R', 'b.R']), makeFinder(previews));

            const result = await resolver.resolve('fix all', { workspaceDir: '/proj' });

            expect(result).toHaveLength(2);
        });

        it('does not call LLMController when no files are found', async () => {
            const client = makeClient([]);
            const resolver = new FileResolver(client, makeFinder([]));

            await resolver.resolve('instruction');

            expect(client.resolveFiles).not.toHaveBeenCalled();
        });

        it('uses process.cwd() and maxFiles=30 as defaults', async () => {
            const finder = makeFinder([]);
            const resolver = new FileResolver(makeClient([]), finder);

            await resolver.resolve('fix');

            const [calledDir, calledMax] = (finder.scan as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(typeof calledDir).toBe('string');
            expect(calledMax).toBe(30);
        });
    });
});
