/**
 * Unit Tests: Library Info Types
 * 
 * Tests for the library info type definitions and factory functions.
 */

import { describe, it, expect } from 'vitest';
import {
    createLibraryInfo,
    createLibraryScanResult,
    LibraryInfo,
    LibraryScanResult,
} from '../src/shared/types/library-info';

describe('Library Info Types', () => {
    describe('createLibraryInfo', () => {
        it('should create LibraryInfo with required properties', () => {
            const info = createLibraryInfo({
                name: 'ggplot2',
                version: '3.5.1',
                libraryPath: 'C:/Users/test/R/win-library/4.4',
            });

            expect(info.name).toBe('ggplot2');
            expect(info.version).toBe('3.5.1');
            expect(info.libraryPath).toBe('C:/Users/test/R/win-library/4.4');
            expect(info.isBase).toBe(false);
            expect(info.title).toBeUndefined();
            expect(info.priority).toBeUndefined();
        });

        it('should create LibraryInfo with all optional properties', () => {
            const info = createLibraryInfo({
                name: 'stats',
                version: '4.4.2',
                libraryPath: 'C:/Program Files/R/R-4.4.2/library',
                title: 'The R Stats Package',
                isBase: true,
                priority: 'base',
            });

            expect(info.name).toBe('stats');
            expect(info.version).toBe('4.4.2');
            expect(info.isBase).toBe(true);
            expect(info.priority).toBe('base');
            expect(info.title).toBe('The R Stats Package');
        });

        it('should default isBase to false when not provided', () => {
            const info = createLibraryInfo({
                name: 'dplyr',
                version: '1.1.0',
                libraryPath: '/path',
            });

            expect(info.isBase).toBe(false);
        });
    });

    describe('createLibraryScanResult', () => {
        it('should create LibraryScanResult with correct counts', () => {
            const libraries: LibraryInfo[] = [
                createLibraryInfo({
                    name: 'ggplot2',
                    version: '3.5.1',
                    libraryPath: '/user/lib',
                    isBase: false,
                }),
                createLibraryInfo({
                    name: 'dplyr',
                    version: '1.1.0',
                    libraryPath: '/user/lib',
                    isBase: false,
                }),
                createLibraryInfo({
                    name: 'stats',
                    version: '4.4.2',
                    libraryPath: '/base/lib',
                    isBase: true,
                }),
            ];

            const result = createLibraryScanResult({
                rVersion: '4.4.2',
                rHome: 'C:/Program Files/R/R-4.4.2',
                libraryPaths: ['/user/lib', '/base/lib'],
                libraries,
            });

            expect(result.rVersion).toBe('4.4.2');
            expect(result.rHome).toBe('C:/Program Files/R/R-4.4.2');
            expect(result.libraryPaths).toHaveLength(2);
            expect(result.totalLibraries).toBe(3);
            expect(result.basePackages).toBe(1);
            expect(result.userPackages).toBe(2);
            expect(result.scannedAt).toBeInstanceOf(Date);
        });

        it('should handle empty libraries array', () => {
            const result = createLibraryScanResult({
                rVersion: '4.4.2',
                rHome: '/path',
                libraryPaths: [],
                libraries: [],
            });

            expect(result.totalLibraries).toBe(0);
            expect(result.basePackages).toBe(0);
            expect(result.userPackages).toBe(0);
        });

        it('should correctly separate base and user packages', () => {
            const libraries: LibraryInfo[] = [
                createLibraryInfo({ name: 'base', version: '4.4.2', libraryPath: '/lib', isBase: true }),
                createLibraryInfo({ name: 'utils', version: '4.4.2', libraryPath: '/lib', isBase: true }),
                createLibraryInfo({ name: 'stats', version: '4.4.2', libraryPath: '/lib', isBase: true }),
                createLibraryInfo({ name: 'ggplot2', version: '3.5.1', libraryPath: '/lib', isBase: false }),
            ];

            const result = createLibraryScanResult({
                rVersion: '4.4.2',
                rHome: '/path',
                libraryPaths: ['/lib'],
                libraries,
            });

            expect(result.basePackages).toBe(3);
            expect(result.userPackages).toBe(1);
        });
    });
});
