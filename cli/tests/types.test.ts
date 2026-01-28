/**
 * Unit Tests: Types
 * 
 * Tests for type definitions (compile-time checks).
 */

import { describe, it, expect } from 'vitest';
import { FileInfo, ProjectInfo, ScanResult, ScanOptions } from '../src/shared/types';

describe('Types', () => {
    describe('FileInfo', () => {
        it('should accept valid FileInfo', () => {
            const fileInfo: FileInfo = {
                path: '/path/to/file.R',
                name: 'file.R',
                size: 1024,
                modifiedAt: new Date(),
                extension: '.r',
            };

            expect(fileInfo.path).toBe('/path/to/file.R');
            expect(fileInfo.name).toBe('file.R');
        });
    });

    describe('ProjectInfo', () => {
        it('should accept rproj type', () => {
            const projectInfo: ProjectInfo = {
                name: 'MyProject',
                path: '/path/to/MyProject.Rproj',
                type: 'rproj',
            };

            expect(projectInfo.type).toBe('rproj');
        });

        it('should accept inferred type', () => {
            const projectInfo: ProjectInfo = {
                name: 'MyProject',
                path: '/path/to/project',
                type: 'inferred',
            };

            expect(projectInfo.type).toBe('inferred');
        });
    });

    describe('ScanResult', () => {
        it('should accept valid ScanResult', () => {
            const result: ScanResult = {
                scannedAt: new Date(),
                baseDirectory: '/project',
                projectInfo: null,
                files: {
                    rScripts: [],
                    rMarkdown: [],
                    rData: [],
                    rProject: [],
                    dataFiles: [],
                    documents: [],
                },
                totalFiles: 0,
            };

            expect(result.totalFiles).toBe(0);
        });
    });

    describe('ScanOptions', () => {
        it('should accept valid ScanOptions', () => {
            const options: ScanOptions = {
                targetDir: '.',
                recursive: true,
                includeHidden: false,
            };

            expect(options.recursive).toBe(true);
        });
    });
});
