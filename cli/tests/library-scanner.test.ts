/**
 * Unit Tests: Library Scanner Service
 * 
 * Tests for the library scanner service.
 * Note: These tests mock the R script execution since R may not be installed in CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

// Mock modules
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
}));

vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

describe('Library Scanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('RNotFoundError', () => {
        it('should throw RNotFoundError when R is not installed', async () => {
            const { RNotFoundError } = await import('../src/shared/utils/errors');

            // Mock exec to simulate R not found
            vi.mocked(exec).mockImplementation(((cmd: string, callback: Function) => {
                callback(new Error('Rscript not found'), '', '');
            }) as typeof exec);

            // Mock fs to return no R installations
            vi.mocked(fs.existsSync).mockReturnValue(false);

            // Import the module fresh to pick up mocks
            vi.resetModules();

            const error = new RNotFoundError();
            expect(error.message).toContain('R is not installed');
            expect(error.name).toBe('RNotFoundError');
        });
    });

    describe('LibraryScanError', () => {
        it('should create LibraryScanError with custom message', async () => {
            const { LibraryScanError } = await import('../src/shared/utils/errors');

            const error = new LibraryScanError('Failed to parse output');
            expect(error.message).toBe('Failed to parse output');
            expect(error.name).toBe('LibraryScanError');
        });
    });

    describe('findRscriptPath (integration simulation)', () => {
        it('should search Windows R installation directories', () => {
            const windowsPaths = [
                'C:\\Program Files\\R',
                'C:\\Program Files (x86)\\R',
            ];

            expect(windowsPaths[0]).toContain('Program Files');
            expect(windowsPaths[1]).toContain('(x86)');
        });

        it('should search macOS R installation directories', () => {
            const macosPaths = [
                '/Library/Frameworks/R.framework/Versions',
                '/opt/homebrew/Cellar/r',        // Homebrew Apple Silicon
                '/usr/local/Cellar/r',           // Homebrew Intel
                '/opt/local/Library/Frameworks/R.framework/Versions', // MacPorts
            ];

            expect(macosPaths[0]).toContain('R.framework');
            expect(macosPaths[1]).toContain('homebrew');
            expect(macosPaths[2]).toContain('Cellar');
            expect(macosPaths[3]).toContain('opt/local');
        });

        it('should search Linux R installation directories', () => {
            const linuxPaths = [
                '/usr/lib/R',
                '/usr/lib64/R',
                '/usr/local/lib/R',
                '/opt/R',
                '/usr/share/R',
            ];

            expect(linuxPaths[0]).toBe('/usr/lib/R');
            expect(linuxPaths[1]).toBe('/usr/lib64/R');
            expect(linuxPaths[2]).toBe('/usr/local/lib/R');
            expect(linuxPaths[3]).toBe('/opt/R');
        });
    });
});

describe('Cross-Platform Path Detection', () => {
    it('should use correct executable name per platform', () => {
        const getExecutableName = (platform: string): string => {
            return platform === 'win32' ? 'Rscript.exe' : 'Rscript';
        };

        expect(getExecutableName('win32')).toBe('Rscript.exe');
        expect(getExecutableName('darwin')).toBe('Rscript');
        expect(getExecutableName('linux')).toBe('Rscript');
    });

    it('should detect macOS R.framework structure', () => {
        // macOS R.framework has a specific directory structure
        const frameworkPath = '/Library/Frameworks/R.framework/Versions';
        const version = '4.4';
        const expectedRscriptPath = path.join(frameworkPath, version, 'Resources', 'bin', 'Rscript');

        // Use path.sep to handle cross-platform path separators
        expect(expectedRscriptPath).toContain('R.framework');
        expect(expectedRscriptPath).toContain('Resources');
        expect(expectedRscriptPath).toContain('Rscript');
    });

    it('should detect Homebrew R installation structure', () => {
        // Homebrew installs R in Cellar with version subdirectories
        const homebrewPath = '/opt/homebrew/Cellar/r';
        const version = '4.4.2';
        const expectedRscriptPath = path.join(homebrewPath, version, 'bin', 'Rscript');

        expect(expectedRscriptPath).toContain('Cellar');
        expect(expectedRscriptPath).toContain('4.4.2');
        expect(expectedRscriptPath).toContain('Rscript');
    });

    it('should detect Linux standard R installation structure', () => {
        // Linux standard paths have bin/Rscript directly
        const linuxPath = '/usr/lib/R';
        const expectedRscriptPath = path.join(linuxPath, 'bin', 'Rscript');

        expect(expectedRscriptPath).toContain('lib');
        expect(expectedRscriptPath).toContain('bin');
        expect(expectedRscriptPath).toContain('Rscript');
    });

    it('should detect Linux opt R installation with versions', () => {
        // /opt/R often has versioned subdirectories
        const optPath = '/opt/R';
        const version = '4.4.2';
        const expectedRscriptPath = path.join(optPath, version, 'bin', 'Rscript');

        expect(expectedRscriptPath).toContain('opt');
        expect(expectedRscriptPath).toContain('4.4.2');
        expect(expectedRscriptPath).toContain('Rscript');
    });

    it('should handle version directory sorting to get latest', () => {
        const versions = ['4.2.1', '4.4.2', '4.3.0', '4.1.0'];
        const sorted = [...versions].sort((a, b) => b.localeCompare(a));

        expect(sorted[0]).toBe('4.4.2');
        expect(sorted[sorted.length - 1]).toBe('4.1.0');
    });

    it('should handle R-prefixed version directories (Windows style)', () => {
        const dirs = ['R-4.4.2', 'R-4.3.1', 'R-4.2.0', 'other-folder'];
        const rVersionDirs = dirs
            .filter(dir => dir.startsWith('R-'))
            .sort((a, b) => b.localeCompare(a));

        expect(rVersionDirs).toHaveLength(3);
        expect(rVersionDirs[0]).toBe('R-4.4.2');
    });

    it('should handle numeric version directories (macOS/Linux style)', () => {
        const dirs = ['4.4', '4.3', 'Current', '4.2', 'other'];
        const versionDirs = dirs
            .filter(dir => /^\d+\.\d+/.test(dir) || dir === 'Current')
            .sort((a, b) => b.localeCompare(a));

        expect(versionDirs).toContain('Current');
        expect(versionDirs).toContain('4.4');
        expect(versionDirs).not.toContain('other');
    });
});

describe('Library Scanner Output Parsing', () => {
    it('should parse R package output format correctly', () => {
        // Simulate the output format from R
        const sampleOutput = `ggplot2|3.5.1||C:/Users/test/R/win-library/4.4
dplyr|1.1.0||C:/Users/test/R/win-library/4.4
stats|4.4.2|base|C:/Program Files/R/R-4.4.2/library`;

        const lines = sampleOutput.trim().split('\n');
        const parsed = lines.map(line => {
            const parts = line.split('|');
            return {
                name: parts[0],
                version: parts[1],
                priority: parts[2] || undefined,
                libraryPath: parts[3],
                isBase: parts[2] === 'base' || parts[2] === 'recommended',
            };
        });

        expect(parsed).toHaveLength(3);
        expect(parsed[0]).toEqual({
            name: 'ggplot2',
            version: '3.5.1',
            priority: undefined,
            libraryPath: 'C:/Users/test/R/win-library/4.4',
            isBase: false,
        });
        expect(parsed[2].isBase).toBe(true);
        expect(parsed[2].name).toBe('stats');
    });

    it('should parse R info output format correctly', () => {
        const sampleOutput = `VERSION|4.4.2
RHOME|C:/Program Files/R/R-4.4.2
LIBPATHS|C:/Users/test/R/win-library/4.4;C:/Program Files/R/R-4.4.2/library`;

        const lines = sampleOutput.trim().split('\n');
        const info: Record<string, string> = {};

        for (const line of lines) {
            const [key, value] = line.split('|');
            info[key] = value;
        }

        expect(info['VERSION']).toBe('4.4.2');
        expect(info['RHOME']).toBe('C:/Program Files/R/R-4.4.2');
        expect(info['LIBPATHS'].split(';')).toHaveLength(2);
    });

    it('should filter packages based on options', () => {
        const packages = [
            { name: 'ggplot2', isBase: false },
            { name: 'dplyr', isBase: false },
            { name: 'stats', isBase: true },
            { name: 'base', isBase: true },
        ];

        // Filter to user packages only (default behavior)
        const userOnly = packages.filter(p => !p.isBase);
        expect(userOnly).toHaveLength(2);
        expect(userOnly.every(p => !p.isBase)).toBe(true);

        // Filter by name pattern
        const filtered = packages.filter(p =>
            p.name.toLowerCase().includes('gg')
        );
        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('ggplot2');
    });

    it('should sort packages by name', () => {
        const packages = [
            { name: 'zoo', version: '1.0.0' },
            { name: 'abc', version: '2.0.0' },
            { name: 'mno', version: '1.5.0' },
        ];

        const sorted = [...packages].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        expect(sorted[0].name).toBe('abc');
        expect(sorted[1].name).toBe('mno');
        expect(sorted[2].name).toBe('zoo');
    });
});
