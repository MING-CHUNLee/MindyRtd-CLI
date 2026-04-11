/**
 * Unit Tests: Domain Value Objects
 *
 * Tests for the domain value objects and their factory functions.
 * Verifies immutability, factory behavior, and value object semantics.
 */

import { describe, it, expect } from 'vitest';
import {
    FileInfo,
    createFileInfo,
    ProjectInfo,
    createProjectInfo,
    ScanResult,
    ScanResultProps,
    RFileCollection,
    createScanResult,
    EnvironmentContext,
} from '../../../src/domain/values';

describe('Domain Value Objects', () => {
    describe('FileInfo', () => {
        describe('createFileInfo', () => {
            it('should create FileInfo with all required properties', () => {
                const info = createFileInfo({
                    path: '/path/to/file.R',
                    name: 'file.R',
                    size: 1024,
                    modifiedAt: new Date('2024-01-01'),
                    extension: '.R',
                });

                expect(info.path).toBe('/path/to/file.R');
                expect(info.name).toBe('file.R');
                expect(info.size).toBe(1024);
                expect(info.extension).toBe('.r');
                expect(info.modifiedAt).toEqual(new Date('2024-01-01'));
            });

            it('should normalize extension to lowercase', () => {
                const info = createFileInfo({
                    path: '/file.RMD',
                    name: 'file.Rmd',
                    size: 512,
                    modifiedAt: new Date(),
                    extension: '.RMD',
                });

                expect(info.extension).toBe('.rmd');
            });

            it('should be frozen (immutable)', () => {
                const info = createFileInfo({
                    path: '/file.R',
                    name: 'file.R',
                    size: 100,
                    modifiedAt: new Date(),
                    extension: '.R',
                });

                expect(() => {
                    (info as any).size = 200;
                }).toThrow();
            });

            it('should handle different file extensions', () => {
                const extensions = ['.r', '.R', '.RMD', '.rmd', '.CSV', '.csv'];

                extensions.forEach(ext => {
                    const info = createFileInfo({
                        path: `/file${ext}`,
                        name: `file${ext}`,
                        size: 100,
                        modifiedAt: new Date(),
                        extension: ext,
                    });

                    expect(info.extension).toBe(ext.toLowerCase());
                });
            });

            it('should handle large file sizes', () => {
                const largeSize = 1024 * 1024 * 1024; // 1 GB

                const info = createFileInfo({
                    path: '/large.csv',
                    name: 'large.csv',
                    size: largeSize,
                    modifiedAt: new Date(),
                    extension: '.csv',
                });

                expect(info.size).toBe(largeSize);
            });

            it('should preserve exact path and name', () => {
                const path = '/path/with spaces/and-dashes/file_123.R';
                const name = 'file_123.R';

                const info = createFileInfo({
                    path,
                    name,
                    size: 0,
                    modifiedAt: new Date(),
                    extension: '.R',
                });

                expect(info.path).toBe(path);
                expect(info.name).toBe(name);
            });
        });
    });

    describe('ProjectInfo', () => {
        describe('createProjectInfo', () => {
            it('should create ProjectInfo with rproj type', () => {
                const info = createProjectInfo({
                    name: 'MyProject',
                    path: '/path/to/MyProject.Rproj',
                    type: 'rproj',
                });

                expect(info.name).toBe('MyProject');
                expect(info.path).toBe('/path/to/MyProject.Rproj');
                expect(info.type).toBe('rproj');
            });

            it('should create ProjectInfo with inferred type', () => {
                const info = createProjectInfo({
                    name: 'InferredProject',
                    path: '/path/to/project',
                    type: 'inferred',
                });

                expect(info.name).toBe('InferredProject');
                expect(info.type).toBe('inferred');
            });

            it('should be frozen (immutable)', () => {
                const info = createProjectInfo({
                    name: 'MyProject',
                    path: '/path',
                    type: 'rproj',
                });

                expect(() => {
                    (info as any).name = 'NewName';
                }).toThrow();
            });

            it('should handle different path formats', () => {
                const testCases = [
                    { path: '/home/user/project', type: 'inferred' as const },
                    { path: 'C:\\Users\\project\\MyProject.Rproj', type: 'rproj' as const },
                    { path: './relative/path', type: 'inferred' as const },
                ];

                testCases.forEach(testCase => {
                    const info = createProjectInfo({
                        name: 'Test',
                        ...testCase,
                    });

                    expect(info.path).toBe(testCase.path);
                    expect(info.type).toBe(testCase.type);
                });
            });
        });
    });

    describe('ScanResult', () => {
        describe('createScanResult', () => {
            it('should create ScanResult with default scannedAt', () => {
                const beforeScan = new Date();

                const result = createScanResult({
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
                });

                const afterScan = new Date();

                expect(result.baseDirectory).toBe('/project');
                expect(result.projectInfo).toBeNull();
                expect(result.scannedAt.getTime()).toBeGreaterThanOrEqual(beforeScan.getTime());
                expect(result.scannedAt.getTime()).toBeLessThanOrEqual(afterScan.getTime());
            });

            it('should create ScanResult with explicit scannedAt', () => {
                const scanDate = new Date('2024-01-15');

                const result = createScanResult({
                    scannedAt: scanDate,
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
                });

                expect(result.scannedAt).toEqual(scanDate);
            });

            it('should calculate totalFiles correctly', () => {
                const rScripts = [
                    createFileInfo({ path: '/a.R', name: 'a.R', size: 0, modifiedAt: new Date(), extension: '.R' }),
                    createFileInfo({ path: '/b.R', name: 'b.R', size: 0, modifiedAt: new Date(), extension: '.R' }),
                ];
                const rMarkdown = [
                    createFileInfo({ path: '/c.Rmd', name: 'c.Rmd', size: 0, modifiedAt: new Date(), extension: '.Rmd' }),
                ];
                const dataFiles = [
                    createFileInfo({ path: '/data.csv', name: 'data.csv', size: 0, modifiedAt: new Date(), extension: '.csv' }),
                    createFileInfo({ path: '/data2.xlsx', name: 'data2.xlsx', size: 0, modifiedAt: new Date(), extension: '.xlsx' }),
                ];

                const result = createScanResult({
                    baseDirectory: '/project',
                    projectInfo: null,
                    files: {
                        rScripts,
                        rMarkdown,
                        rData: [],
                        rProject: [],
                        dataFiles,
                        documents: [],
                    },
                });

                expect(result.totalFiles).toBe(5); // 2 + 1 + 2
                expect(result.files.rScripts).toHaveLength(2);
                expect(result.files.rMarkdown).toHaveLength(1);
                expect(result.files.dataFiles).toHaveLength(2);
            });

            it('should calculate totalFiles as zero when no files', () => {
                const result = createScanResult({
                    baseDirectory: '/empty',
                    projectInfo: null,
                    files: {
                        rScripts: [],
                        rMarkdown: [],
                        rData: [],
                        rProject: [],
                        dataFiles: [],
                        documents: [],
                    },
                });

                expect(result.totalFiles).toBe(0);
            });

            it('should include project info when provided', () => {
                const projectInfo = createProjectInfo({
                    name: 'TestProject',
                    path: '/project/test.Rproj',
                    type: 'rproj',
                });

                const result = createScanResult({
                    baseDirectory: '/project',
                    projectInfo,
                    files: {
                        rScripts: [],
                        rMarkdown: [],
                        rData: [],
                        rProject: [],
                        dataFiles: [],
                        documents: [],
                    },
                });

                expect(result.projectInfo).toEqual(projectInfo);
                expect(result.projectInfo?.name).toBe('TestProject');
            });

            it('should be frozen (immutable)', () => {
                const result = createScanResult({
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
                });

                expect(() => {
                    (result as any).totalFiles = 999;
                }).toThrow();
            });

            it('should handle complex file collections', () => {
                const files: RFileCollection = {
                    rScripts: Array.from({ length: 10 }, (_, i) =>
                        createFileInfo({
                            path: `/script${i}.R`,
                            name: `script${i}.R`,
                            size: 1000 + i * 100,
                            modifiedAt: new Date(),
                            extension: '.R',
                        })
                    ),
                    rMarkdown: Array.from({ length: 5 }, (_, i) =>
                        createFileInfo({
                            path: `/report${i}.Rmd`,
                            name: `report${i}.Rmd`,
                            size: 2000,
                            modifiedAt: new Date(),
                            extension: '.Rmd',
                        })
                    ),
                    rData: Array.from({ length: 3 }, (_, i) =>
                        createFileInfo({
                            path: `/data${i}.rds`,
                            name: `data${i}.rds`,
                            size: 5000,
                            modifiedAt: new Date(),
                            extension: '.rds',
                        })
                    ),
                    rProject: [
                        createFileInfo({
                            path: '/project.Rproj',
                            name: 'project.Rproj',
                            size: 100,
                            modifiedAt: new Date(),
                            extension: '.Rproj',
                        }),
                    ],
                    dataFiles: Array.from({ length: 8 }, (_, i) =>
                        createFileInfo({
                            path: `/data${i}.csv`,
                            name: `data${i}.csv`,
                            size: 10000,
                            modifiedAt: new Date(),
                            extension: '.csv',
                        })
                    ),
                    documents: Array.from({ length: 2 }, (_, i) =>
                        createFileInfo({
                            path: `/doc${i}.pdf`,
                            name: `doc${i}.pdf`,
                            size: 50000,
                            modifiedAt: new Date(),
                            extension: '.pdf',
                        })
                    ),
                };

                const result = createScanResult({
                    baseDirectory: '/complex',
                    projectInfo: null,
                    files,
                });

                expect(result.totalFiles).toBe(10 + 5 + 3 + 1 + 8 + 2);
                expect(result.files.rScripts).toHaveLength(10);
                expect(result.files.rMarkdown).toHaveLength(5);
                expect(result.files.rData).toHaveLength(3);
                expect(result.files.rProject).toHaveLength(1);
                expect(result.files.dataFiles).toHaveLength(8);
                expect(result.files.documents).toHaveLength(2);
            });
        });
    });

    describe('EnvironmentContext', () => {
        it('should accept valid EnvironmentContext interface', () => {
            const context: EnvironmentContext = {
                rEnvironment: {
                    scannedAt: new Date(),
                    rVersion: '4.4.2',
                    rHome: '/path/to/R',
                    libraryPaths: ['/path/to/lib'],
                    libraries: [],
                    totalLibraries: 0,
                    basePackages: 0,
                    userPackages: 0,
                },
                fileContext: {
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
                },
                workingDirectory: '/project',
                generatedAt: new Date(),
            };

            expect(context.rEnvironment.rVersion).toBe('4.4.2');
            expect(context.fileContext.baseDirectory).toBe('/project');
            expect(context.workingDirectory).toBe('/project');
        });

        it('should combine R environment and file scan results', () => {
            const scanResult = createScanResult({
                baseDirectory: '/project',
                projectInfo: createProjectInfo({
                    name: 'MyProject',
                    path: '/project/myproj.Rproj',
                    type: 'rproj',
                }),
                files: {
                    rScripts: [
                        createFileInfo({
                            path: '/project/script.R',
                            name: 'script.R',
                            size: 500,
                            modifiedAt: new Date(),
                            extension: '.R',
                        }),
                    ],
                    rMarkdown: [],
                    rData: [],
                    rProject: [],
                    dataFiles: [],
                    documents: [],
                },
            });

            const context: EnvironmentContext = {
                rEnvironment: {
                    scannedAt: new Date(),
                    rVersion: '4.4.2',
                    rHome: '/usr/lib/R',
                    libraryPaths: ['/home/user/R/library'],
                    libraries: [],
                    totalLibraries: 0,
                    basePackages: 0,
                    userPackages: 0,
                },
                fileContext: scanResult,
                workingDirectory: '/project',
                generatedAt: new Date(),
            };

            expect(context.rEnvironment.rVersion).toBe('4.4.2');
            expect(context.fileContext.projectInfo?.name).toBe('MyProject');
            expect(context.fileContext.files.rScripts).toHaveLength(1);
            expect(context.fileContext.totalFiles).toBe(1);
        });
    });

    describe('Value Object Semantics', () => {
        it('FileInfo values with same content are equivalent', () => {
            const file1 = createFileInfo({
                path: '/file.R',
                name: 'file.R',
                size: 100,
                modifiedAt: new Date('2024-01-01'),
                extension: '.R',
            });

            const file2 = createFileInfo({
                path: '/file.R',
                name: 'file.R',
                size: 100,
                modifiedAt: new Date('2024-01-01'),
                extension: '.R',
            });

            // Value objects should have identical content
            expect(file1.path).toBe(file2.path);
            expect(file1.name).toBe(file2.name);
            expect(file1.size).toBe(file2.size);
            expect(file1.extension).toBe(file2.extension);
        });

        it('ProjectInfo values with same content are equivalent', () => {
            const proj1 = createProjectInfo({
                name: 'MyProject',
                path: '/path',
                type: 'rproj',
            });

            const proj2 = createProjectInfo({
                name: 'MyProject',
                path: '/path',
                type: 'rproj',
            });

            expect(proj1.name).toBe(proj2.name);
            expect(proj1.path).toBe(proj2.path);
            expect(proj1.type).toBe(proj2.type);
        });

        it('ScanResult is independent of input mutation', () => {
            const fileArray = [
                createFileInfo({
                    path: '/file.R',
                    name: 'file.R',
                    size: 100,
                    modifiedAt: new Date(),
                    extension: '.R',
                }),
            ];

            const fileCollection = {
                rScripts: fileArray,
                rMarkdown: [],
                rData: [],
                rProject: [],
                dataFiles: [],
                documents: [],
            };

            const result = createScanResult({
                baseDirectory: '/project',
                projectInfo: null,
                files: fileCollection,
            });

            // Mutation of original array should not affect result
            fileArray.push(
                createFileInfo({
                    path: '/file2.R',
                    name: 'file2.R',
                    size: 200,
                    modifiedAt: new Date(),
                    extension: '.R',
                })
            );

            expect(result.totalFiles).toBe(1);
        });
    });
});
