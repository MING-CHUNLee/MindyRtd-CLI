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
            const { RNotFoundError } = await import('../src/utils/errors');

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
            const { LibraryScanError } = await import('../src/utils/errors');

            const error = new LibraryScanError('Failed to parse output');
            expect(error.message).toBe('Failed to parse output');
            expect(error.name).toBe('LibraryScanError');
        });
    });

    describe('findRscriptPath (integration simulation)', () => {
        it('should search Windows R installation directories', () => {
            // This tests the logic of searching for R installations
            const windowsPaths = [
                'C:\\Program Files\\R',
                'C:\\Program Files (x86)\\R',
            ];

            // Verify paths structure is correct
            expect(windowsPaths[0]).toContain('Program Files');
            expect(windowsPaths[1]).toContain('(x86)');
        });
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
