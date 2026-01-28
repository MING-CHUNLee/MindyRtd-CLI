/**
 * Unit Tests: File Scanner Service
 * 
 * Tests for the file scanner service that scans directories for R-related files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { GlobOptions } from 'glob';

// Mock modules
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    statSync: vi.fn(),
}));

vi.mock('glob', () => ({
    glob: vi.fn(),
}));

// Import glob after mocking
const { glob } = await import('glob');

describe('File Scanner Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('scanDirectory - Directory Validation', () => {
        it('should throw DirectoryNotFoundError for non-existent directory', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');
            const { DirectoryNotFoundError } = await import('../src/shared/utils/errors');

            vi.mocked(fs.existsSync).mockReturnValue(false);

            await expect(
                scanDirectory({
                    targetDir: '/nonexistent',
                    recursive: true,
                    includeHidden: false
                })
            ).rejects.toThrow(DirectoryNotFoundError);
        });

        it('should throw InvalidDirectoryError when path is a file', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');
            const { InvalidDirectoryError } = await import('../src/shared/utils/errors');

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockReturnValue({
                isDirectory: () => false,
                isFile: () => true,
            } as fs.Stats);

            await expect(
                scanDirectory({
                    targetDir: '/path/to/file.txt',
                    recursive: true,
                    includeHidden: false
                })
            ).rejects.toThrow(InvalidDirectoryError);
        });

        it('should accept valid directory path', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockReturnValue({
                isDirectory: () => true,
                isFile: () => false,
            } as fs.Stats);

            // Mock glob to return empty arrays
            vi.mocked(glob).mockResolvedValue([]);

            const result = await scanDirectory({
                targetDir: '/valid/directory',
                recursive: true,
                includeHidden: false
            });

            expect(result).toBeDefined();
            expect(result.baseDirectory).toContain('valid');
        });
    });

    describe('scanDirectory - File Discovery', () => {
        beforeEach(() => {
            // Setup valid directory
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockImplementation((filePath) => {
                if (typeof filePath === 'string' && filePath.includes('.')) {
                    // It's a file
                    return {
                        isDirectory: () => false,
                        isFile: () => true,
                        size: 1024,
                        mtime: new Date('2024-01-01'),
                    } as fs.Stats;
                }
                // It's a directory
                return {
                    isDirectory: () => true,
                    isFile: () => false,
                } as fs.Stats;
            });
        });

        it('should find R script files', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.R')) {
                    return ['/test/script1.R', '/test/script2.R'];
                }
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.files.rScripts).toHaveLength(2);
            expect(result.files.rScripts[0].name).toBe('script1.R');
            expect(result.files.rScripts[1].name).toBe('script2.R');
        });

        it('should find R Markdown files', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.Rmd')) {
                    return ['/test/report.Rmd'];
                }
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.files.rMarkdown).toHaveLength(1);
            expect(result.files.rMarkdown[0].name).toBe('report.Rmd');
        });

        it('should find R data files (RData and rds)', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.RData')) {
                    return ['/test/data.RData'];
                }
                if (typeof pattern === 'string' && pattern.includes('.rds')) {
                    return ['/test/model.rds'];
                }
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.files.rData).toHaveLength(2);
        });

        it('should find R project files', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.Rproj')) {
                    return ['/test/myproject.Rproj'];
                }
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.files.rProject).toHaveLength(1);
            expect(result.files.rProject[0].name).toBe('myproject.Rproj');
        });

        it('should find data files (csv, xlsx, json, etc.)', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.csv')) return ['/test/data.csv'];
                if (typeof pattern === 'string' && pattern.includes('.xlsx')) return ['/test/data.xlsx'];
                if (typeof pattern === 'string' && pattern.includes('.json')) return ['/test/config.json'];
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.files.dataFiles).toHaveLength(3);
        });

        it('should find document files (pdf, html, tex)', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.pdf')) return ['/test/report.pdf'];
                if (typeof pattern === 'string' && pattern.includes('.html')) return ['/test/output.html'];
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.files.documents).toHaveLength(2);
        });
    });

    describe('scanDirectory - Scan Options', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockReturnValue({
                isDirectory: () => true,
                isFile: () => false,
            } as fs.Stats);
        });

        it('should use recursive pattern when recursive is true', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockResolvedValue([]);

            await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            // Check that glob was called with recursive pattern (**/*)
            expect(vi.mocked(glob)).toHaveBeenCalled();
            const firstCall = vi.mocked(glob).mock.calls[0];
            expect(firstCall[0]).toContain('**');
        });

        it('should use top-level pattern when recursive is false', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockResolvedValue([]);

            await scanDirectory({
                targetDir: '/test',
                recursive: false,
                includeHidden: false
            });

            // Check that glob was called with top-level pattern (*)
            expect(vi.mocked(glob)).toHaveBeenCalled();
            const firstCall = vi.mocked(glob).mock.calls[0];
            expect(firstCall[0]).not.toContain('**');
        });

        it('should exclude hidden files when includeHidden is false', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockResolvedValue([]);

            await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            // Check that glob was called with ignore patterns
            expect(vi.mocked(glob)).toHaveBeenCalled();
            const firstCall = vi.mocked(glob).mock.calls[0];
            expect(firstCall[1]).toHaveProperty('ignore');
        });
    });

    describe('scanDirectory - Project Detection', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockImplementation((filePath) => {
                if (typeof filePath === 'string' && filePath.includes('.')) {
                    return {
                        isDirectory: () => false,
                        isFile: () => true,
                        size: 1024,
                        mtime: new Date('2024-01-01'),
                    } as fs.Stats;
                }
                return {
                    isDirectory: () => true,
                    isFile: () => false,
                } as fs.Stats;
            });
        });

        it('should detect R project from .Rproj file', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.Rproj')) {
                    return ['/test/myproject.Rproj'];
                }
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.projectInfo).not.toBeNull();
            expect(result.projectInfo?.name).toBe('myproject');
            expect(result.projectInfo?.type).toBe('rproj');
        });

        it('should infer project from directory name when no .Rproj exists', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockResolvedValue([]);

            const result = await scanDirectory({
                targetDir: '/my-r-project',
                recursive: true,
                includeHidden: false
            });

            expect(result.projectInfo).not.toBeNull();
            expect(result.projectInfo?.name).toBe('my-r-project');
            expect(result.projectInfo?.type).toBe('inferred');
        });
    });

    describe('scanDirectory - Result Structure', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.statSync).mockImplementation((filePath) => {
                if (typeof filePath === 'string' && filePath.includes('.')) {
                    return {
                        isDirectory: () => false,
                        isFile: () => true,
                        size: 2048,
                        mtime: new Date('2024-01-15'),
                    } as fs.Stats;
                }
                return {
                    isDirectory: () => true,
                    isFile: () => false,
                } as fs.Stats;
            });
        });

        it('should return correct result structure', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockResolvedValue([]);

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result).toHaveProperty('scannedAt');
            expect(result).toHaveProperty('baseDirectory');
            expect(result).toHaveProperty('projectInfo');
            expect(result).toHaveProperty('files');
            expect(result).toHaveProperty('totalFiles');
            expect(result.scannedAt).toBeInstanceOf(Date);
        });

        it('should calculate total files correctly', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                // Match only .R files (not .Rmd, .RData, .rds, .Rproj)
                if (typeof pattern === 'string' && pattern.endsWith('.R')) return ['/test/script.R'];
                if (typeof pattern === 'string' && pattern.endsWith('.Rmd')) return ['/test/report.Rmd'];
                if (typeof pattern === 'string' && pattern.endsWith('.csv')) return ['/test/data.csv'];
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            expect(result.totalFiles).toBe(3);
        });

        it('should include file metadata', async () => {
            const { scanDirectory } = await import('../src/core/services/file-scanner');

            vi.mocked(glob).mockImplementation(async (pattern: string | string[], _options?: GlobOptions) => {
                if (typeof pattern === 'string' && pattern.includes('.R')) {
                    return ['/test/script.R'];
                }
                return [];
            });

            const result = await scanDirectory({
                targetDir: '/test',
                recursive: true,
                includeHidden: false
            });

            const file = result.files.rScripts[0];
            expect(file).toHaveProperty('path');
            expect(file).toHaveProperty('name');
            expect(file).toHaveProperty('size');
            expect(file).toHaveProperty('modifiedAt');
            expect(file).toHaveProperty('extension');
            expect(file.size).toBe(2048);
            expect(file.extension).toBe('.r');
        });
    });
});
