/**
 * Unit Tests: FileFinder
 *
 * Mocks: glob (filesystem glob), fs/promises (readFile)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock glob ──────────────────────────────────────────────────────────────
vi.mock('glob', () => ({
    glob: vi.fn(),
}));

// ── mock fs/promises ───────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
}));

import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { FileFinder } from '../src/application/services/file-finder';

const mockGlob = glob as unknown as ReturnType<typeof vi.fn>;
const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;

describe('FileFinder', () => {
    let finder: FileFinder;

    beforeEach(() => {
        finder = new FileFinder();
        vi.clearAllMocks();
    });

    describe('scan()', () => {
        it('returns empty array when no R files are found', async () => {
            mockGlob.mockResolvedValue([]);

            const result = await finder.scan('/workspace', 30);

            expect(result).toEqual([]);
        });

        it('returns previews for found files', async () => {
            mockGlob
                .mockResolvedValueOnce(['/workspace/script.R'])
                .mockResolvedValue([]);

            // No trailing newline so split/slice/join is deterministic
            mockReadFile.mockResolvedValue('x <- 1\ny <- 2\nz <- 3');

            const result = await finder.scan('/workspace', 30);

            expect(result).toHaveLength(1);
            expect(result[0].path).toBe('script.R');
            expect(result[0].preview).toBe('x <- 1\ny <- 2\nz <- 3');
        });

        it('caps preview at 10 lines', async () => {
            mockGlob
                .mockResolvedValueOnce(['/workspace/big.R'])
                .mockResolvedValue([]);

            const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');
            mockReadFile.mockResolvedValue(lines);

            const result = await finder.scan('/workspace', 30);

            expect(result[0].preview.split('\n')).toHaveLength(10);
        });

        it('caps total results at maxFiles', async () => {
            const manyFiles = ['/workspace/a.R', '/workspace/b.R', '/workspace/c.R'];
            mockGlob.mockResolvedValueOnce(manyFiles).mockResolvedValue([]);
            mockReadFile.mockResolvedValue('content');

            const result = await finder.scan('/workspace', 2);

            expect(result).toHaveLength(2);
        });

        it('skips files that cannot be read', async () => {
            mockGlob
                .mockResolvedValueOnce(['/workspace/ok.R', '/workspace/bad.R'])
                .mockResolvedValue([]);

            mockReadFile
                .mockResolvedValueOnce('good content')
                .mockRejectedValueOnce(new Error('EACCES'));

            const result = await finder.scan('/workspace', 30);

            expect(result).toHaveLength(1);
            expect(result[0].path).toBe('ok.R');
        });

        it('deduplicates paths returned by multiple glob patterns', async () => {
            // Simulate the same file matched by two different patterns
            mockGlob
                .mockResolvedValueOnce(['/workspace/script.R'])
                .mockResolvedValueOnce(['/workspace/script.R'])
                .mockResolvedValue([]);

            mockReadFile.mockResolvedValue('x <- 1');

            const result = await finder.scan('/workspace', 30);

            expect(result).toHaveLength(1);
        });

        it('uses relative paths in returned previews', async () => {
            mockGlob
                .mockResolvedValueOnce(['/workspace/subdir/analysis.R'])
                .mockResolvedValue([]);

            mockReadFile.mockResolvedValue('x <- 1');

            const result = await finder.scan('/workspace', 30);

            // Normalize separators for cross-platform compatibility
            expect(result[0].path.replace(/\\/g, '/')).toBe('subdir/analysis.R');
        });
    });
});
