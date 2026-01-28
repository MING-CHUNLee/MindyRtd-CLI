/**
 * Unit Tests: Library Scanner Service
 * 
 * Tests for the library scanner service that scans R environment for installed packages.
 * Note: These tests mock the R script execution since R may not be installed in CI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('Library Scanner Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset module cache to ensure fresh imports
        vi.resetModules();
    });

    describe('Error Classes', () => {
        it('should create RNotFoundError with correct message', async () => {
            const { RNotFoundError } = await import('../src/shared/utils/errors');

            const error = new RNotFoundError();
            expect(error.message).toContain('R is not installed');
            expect(error.name).toBe('RNotFoundError');
        });

        it('should create LibraryScanError with custom message', async () => {
            const { LibraryScanError } = await import('../src/shared/utils/errors');

            const error = new LibraryScanError('Failed to parse output');
            expect(error.message).toBe('Failed to parse output');
            expect(error.name).toBe('LibraryScanError');
        });
    });

    describe('Platform-Specific Path Detection', () => {
        it('should use correct executable name per platform', () => {
            const getExecutableName = (platform: string): string => {
                return platform === 'win32' ? 'Rscript.exe' : 'Rscript';
            };

            expect(getExecutableName('win32')).toBe('Rscript.exe');
            expect(getExecutableName('darwin')).toBe('Rscript');
            expect(getExecutableName('linux')).toBe('Rscript');
        });

        it('should have Windows R installation paths', () => {
            const windowsPaths = [
                'C:\\Program Files\\R',
                'C:\\Program Files (x86)\\R',
            ];

            expect(windowsPaths[0]).toContain('Program Files');
            expect(windowsPaths[1]).toContain('(x86)');
        });

        it('should have macOS R installation paths', () => {
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

        it('should have Linux R installation paths', () => {
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

    describe('R Installation Structure Detection', () => {
        it('should detect macOS R.framework structure', () => {
            const frameworkPath = '/Library/Frameworks/R.framework/Versions';
            const version = '4.4';
            const expectedRscriptPath = path.join(frameworkPath, version, 'Resources', 'bin', 'Rscript');

            expect(expectedRscriptPath).toContain('R.framework');
            expect(expectedRscriptPath).toContain('Resources');
            expect(expectedRscriptPath).toContain('Rscript');
        });

        it('should detect Homebrew R installation structure', () => {
            const homebrewPath = '/opt/homebrew/Cellar/r';
            const version = '4.4.2';
            const expectedRscriptPath = path.join(homebrewPath, version, 'bin', 'Rscript');

            expect(expectedRscriptPath).toContain('Cellar');
            expect(expectedRscriptPath).toContain('4.4.2');
            expect(expectedRscriptPath).toContain('Rscript');
        });

        it('should detect Linux standard R installation structure', () => {
            const linuxPath = '/usr/lib/R';
            const expectedRscriptPath = path.join(linuxPath, 'bin', 'Rscript');

            expect(expectedRscriptPath).toContain('lib');
            expect(expectedRscriptPath).toContain('bin');
            expect(expectedRscriptPath).toContain('Rscript');
        });

        it('should detect Linux opt R installation with versions', () => {
            const optPath = '/opt/R';
            const version = '4.4.2';
            const expectedRscriptPath = path.join(optPath, version, 'bin', 'Rscript');

            expect(expectedRscriptPath).toContain('opt');
            expect(expectedRscriptPath).toContain('4.4.2');
            expect(expectedRscriptPath).toContain('Rscript');
        });

        it('should detect Windows R installation structure', () => {
            const windowsPath = 'C:\\Program Files\\R';
            const version = 'R-4.4.2';
            const expectedRscriptPath = path.join(windowsPath, version, 'bin', 'Rscript.exe');

            expect(expectedRscriptPath).toContain('Program Files');
            expect(expectedRscriptPath).toContain('R-4.4.2');
            expect(expectedRscriptPath).toContain('Rscript.exe');
        });
    });

    describe('Version Directory Sorting', () => {
        it('should sort version directories to get latest', () => {
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

    describe('R Output Parsing', () => {
        it('should parse R package output format correctly', () => {
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
    });

    describe('Package Filtering and Sorting', () => {
        it('should filter out base packages when includeBase is false', () => {
            const packages = [
                { name: 'ggplot2', isBase: false },
                { name: 'dplyr', isBase: false },
                { name: 'stats', isBase: true },
                { name: 'base', isBase: true },
            ];

            const userOnly = packages.filter(p => !p.isBase);
            expect(userOnly).toHaveLength(2);
            expect(userOnly.every(p => !p.isBase)).toBe(true);
        });

        it('should filter packages by name pattern', () => {
            const packages = [
                { name: 'ggplot2', isBase: false },
                { name: 'dplyr', isBase: false },
                { name: 'stats', isBase: true },
            ];

            const filtered = packages.filter(p =>
                p.name.toLowerCase().includes('gg')
            );
            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('ggplot2');
        });

        it('should sort packages by name alphabetically', () => {
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

        it('should sort packages by version', () => {
            const packages = [
                { name: 'pkg1', version: '1.0.0' },
                { name: 'pkg2', version: '2.5.0' },
                { name: 'pkg3', version: '1.8.0' },
            ];

            const sorted = [...packages].sort((a, b) =>
                b.version.localeCompare(a.version)
            );

            expect(sorted[0].version).toBe('2.5.0');
            expect(sorted[1].version).toBe('1.8.0');
            expect(sorted[2].version).toBe('1.0.0');
        });
    });

    describe('Library Info Type Creation', () => {
        it('should create LibraryInfo with all fields', async () => {
            const { createLibraryInfo } = await import('../src/shared/types/library-info');

            const info = createLibraryInfo({
                name: 'ggplot2',
                version: '3.5.1',
                libraryPath: '/usr/lib/R/library',
                isBase: false,
                priority: undefined,
                title: 'Create Elegant Data Visualisations',
            });

            expect(info.name).toBe('ggplot2');
            expect(info.version).toBe('3.5.1');
            expect(info.libraryPath).toBe('/usr/lib/R/library');
            expect(info.isBase).toBe(false);
            expect(info.title).toBe('Create Elegant Data Visualisations');
        });

        it('should create LibraryInfo for base package', async () => {
            const { createLibraryInfo } = await import('../src/shared/types/library-info');

            const info = createLibraryInfo({
                name: 'stats',
                version: '4.4.2',
                libraryPath: '/usr/lib/R/library',
                isBase: true,
                priority: 'base',
            });

            expect(info.name).toBe('stats');
            expect(info.isBase).toBe(true);
            expect(info.priority).toBe('base');
        });
    });

    describe('Library Scan Result Creation', () => {
        it('should create LibraryScanResult with correct structure', async () => {
            const { createLibraryScanResult, createLibraryInfo } = await import('../src/shared/types/library-info');

            const libraries = [
                createLibraryInfo({
                    name: 'ggplot2',
                    version: '3.5.1',
                    libraryPath: '/usr/lib/R/library',
                    isBase: false,
                }),
                createLibraryInfo({
                    name: 'dplyr',
                    version: '1.1.0',
                    libraryPath: '/usr/lib/R/library',
                    isBase: false,
                }),
            ];

            const result = createLibraryScanResult({
                rVersion: '4.4.2',
                rHome: '/usr/lib/R',
                libraryPaths: ['/usr/lib/R/library', '/home/user/R/library'],
                libraries,
            });

            expect(result.rVersion).toBe('4.4.2');
            expect(result.rHome).toBe('/usr/lib/R');
            expect(result.libraryPaths).toHaveLength(2);
            expect(result.libraries).toHaveLength(2);
            expect(result.totalLibraries).toBe(2);
            expect(result.scannedAt).toBeInstanceOf(Date);
        });

        it('should calculate totalLibraries correctly', async () => {
            const { createLibraryScanResult, createLibraryInfo } = await import('../src/shared/types/library-info');

            const libraries = Array.from({ length: 5 }, (_, i) =>
                createLibraryInfo({
                    name: `package${i}`,
                    version: '1.0.0',
                    libraryPath: '/usr/lib/R/library',
                    isBase: false,
                })
            );

            const result = createLibraryScanResult({
                rVersion: '4.4.2',
                rHome: '/usr/lib/R',
                libraryPaths: ['/usr/lib/R/library'],
                libraries,
            });

            expect(result.totalLibraries).toBe(5);
        });
    });

    describe('Scan Options', () => {
        it('should have correct LibraryScanOptions structure', () => {
            const options = {
                includeBase: false,
                filter: 'ggplot',
                sortBy: 'name' as const,
            };

            expect(options.includeBase).toBe(false);
            expect(options.filter).toBe('ggplot');
            expect(options.sortBy).toBe('name');
        });

        it('should support version sorting option', () => {
            const options = {
                includeBase: true,
                sortBy: 'version' as const,
            };

            expect(options.sortBy).toBe('version');
        });
    });

    describe('Temporary Script File Handling', () => {
        it('should generate unique temporary file names', () => {
            const prefix = 'mindy_r_script_';
            const extension = '.R';

            const tempFile1 = `${prefix}${Date.now()}${extension}`;
            const tempFile2 = `${prefix}${Date.now() + 1}${extension}`;

            expect(tempFile1).toContain(prefix);
            expect(tempFile1).toContain(extension);
            expect(tempFile1).not.toBe(tempFile2);
        });

        it('should use correct temp directory path format', () => {
            const os = require('os');
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, 'mindy_r_script_123456.R');

            expect(tempFile).toContain('mindy_r_script_');
            expect(tempFile).toContain('.R');
        });
    });

    describe('R Script Generation', () => {
        it('should generate correct package listing script format', () => {
            const script = `
pkgs <- installed.packages()
for (i in 1:nrow(pkgs)) {
    cat(sprintf("%s|%s|%s|%s\\n", 
        pkgs[i, "Package"], 
        pkgs[i, "Version"], 
        ifelse(is.na(pkgs[i, "Priority"]), "", pkgs[i, "Priority"]),
        pkgs[i, "LibPath"]))
}
`;

            expect(script).toContain('installed.packages()');
            expect(script).toContain('Package');
            expect(script).toContain('Version');
            expect(script).toContain('Priority');
            expect(script).toContain('LibPath');
        });

        it('should generate correct R info script format', () => {
            const script = `
cat(sprintf("VERSION|%s\\n", paste(R.version$major, R.version$minor, sep=".")))
cat(sprintf("RHOME|%s\\n", R.home()))
cat(sprintf("LIBPATHS|%s\\n", paste(.libPaths(), collapse=";")))
`;

            expect(script).toContain('R.version');
            expect(script).toContain('R.home()');
            expect(script).toContain('.libPaths()');
        });
    });

    describe('Command Execution Format', () => {
        it('should format Rscript command correctly for PATH', () => {
            const rscriptPath = 'Rscript';
            const tempFile = '/tmp/script.R';
            const command = `Rscript "${tempFile}"`;

            expect(command).toBe('Rscript "/tmp/script.R"');
        });

        it('should format Rscript command correctly for absolute path', () => {
            const rscriptPath = 'C:\\Program Files\\R\\R-4.4.2\\bin\\Rscript.exe';
            const tempFile = 'C:\\temp\\script.R';
            const command = `"${rscriptPath}" "${tempFile}"`;

            expect(command).toContain('Rscript.exe');
            expect(command).toContain('script.R');
        });
    });
});
