/**
 * Unit Tests: File Scanner Service
 * 
 * Tests for the file scanner service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    statSync: vi.fn(),
}));

// Mock glob module
vi.mock('glob', () => ({
    glob: vi.fn().mockResolvedValue([]),
}));

describe('File Scanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('scanDirectory', () => {
        it('should throw DirectoryNotFoundError for non-existent directory', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');
            vi.mocked(fs.existsSync).mockReturnValue(false);

            await expect(
                scanDirectory({ targetDir: '/nonexistent', recursive: true, includeHidden: false })
            ).rejects.toThrow('Directory not found');
        });

        it('should throw InvalidDirectoryError for file path', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockReturnValue({
                isDirectory: () => false,
                isFile: () => true,
            } as fs.Stats);

            await expect(
                scanDirectory({ targetDir: '/file.txt', recursive: true, includeHidden: false })
            ).rejects.toThrow('not a directory');
        });
    });
});
