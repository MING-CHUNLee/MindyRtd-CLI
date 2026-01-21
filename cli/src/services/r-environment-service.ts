/**
 * Service: R Environment Service
 * 
 * High-level service that integrates all environment scanning and context building.
 * This is the main entry point for CLI commands to get environment context.
 * 
 * Architecture Note:
 * - Types are defined in /types/environment.ts
 * - Display formatting is in /views/environment-result.ts
 * - This service focuses purely on business logic (Clean Architecture)
 */

import { scanLibraries, isPackageInstalled, getPackageInfo } from './library-scanner';
import { scanDirectory } from './file-scanner';
import { ContextBuilder } from './context-builder';
import { LibraryScanResult, createLibraryScanResult } from '../types/library-info';
import { ScanResult } from '../types';
import { ContextSummary } from '../types/prompt-context';
import {
    EnvironmentServiceOptions,
    EnvironmentReport,
    PackageCheckResult,
    RHealthCheck,
    EnvironmentCapabilities
} from '../types/environment';

// Re-export types for backward compatibility
export {
    EnvironmentServiceOptions,
    EnvironmentReport,
    PackageCheckResult,
    RHealthCheck,
    EnvironmentCapabilities
} from '../types/environment';

// ============================================
// R Environment Service
// ============================================

export class REnvironmentService {
    private options: Required<EnvironmentServiceOptions>;
    private cachedReport: EnvironmentReport | null = null;
    private cacheTime: Date | null = null;
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    constructor(options: EnvironmentServiceOptions = {}) {
        this.options = {
            workingDir: options.workingDir || process.cwd(),
            includeBasePackages: options.includeBasePackages ?? false,
            recursiveScan: options.recursiveScan ?? true,
            contextOptions: options.contextOptions || {},
        };
    }

    /**
     * Get complete environment report
     * Uses caching to avoid repeated scans
     */
    async getEnvironmentReport(forceRefresh = false): Promise<EnvironmentReport> {
        // Check cache
        if (!forceRefresh && this.cachedReport && this.cacheTime) {
            const age = Date.now() - this.cacheTime.getTime();
            if (age < this.CACHE_TTL_MS) {
                return this.cachedReport;
            }
        }

        const warnings: string[] = [];

        // Scan libraries
        let libraryResult: LibraryScanResult;
        try {
            libraryResult = await scanLibraries({
                includeBase: this.options.includeBasePackages,
                sortBy: 'name',
            });
        } catch (error) {
            warnings.push(`Library scan warning: ${(error as Error).message}`);
            // Return empty result if R is not found
            libraryResult = createLibraryScanResult({
                rVersion: 'unknown',
                rHome: '',
                libraryPaths: [],
                libraries: [],
            });
        }

        // Scan files
        let fileResult: ScanResult;
        try {
            fileResult = await scanDirectory({
                targetDir: this.options.workingDir,
                recursive: this.options.recursiveScan,
                includeHidden: false,
            });
        } catch (error) {
            warnings.push(`File scan warning: ${(error as Error).message}`);
            // Return minimal result
            fileResult = {
                scannedAt: new Date(),
                baseDirectory: this.options.workingDir,
                projectInfo: null,
                files: { rScripts: [], rMarkdown: [], rData: [], rProject: [] },
                totalFiles: 0,
            };
        }

        // Build context and generate prompt
        const builder = new ContextBuilder(this.options.contextOptions);
        const context = builder.buildContext(libraryResult, fileResult);
        const prompt = builder.generatePrompt(context);

        const report: EnvironmentReport = {
            context,
            prompt,
            libraryResult,
            fileResult,
            summary: prompt.contextSummary,
            warnings,
        };

        // Cache the result
        this.cachedReport = report;
        this.cacheTime = new Date();

        return report;
    }

    /**
     * Get just the system prompt (convenience method)
     */
    async getSystemPrompt(forceRefresh = false): Promise<string> {
        const report = await this.getEnvironmentReport(forceRefresh);
        return report.prompt.systemPrompt;
    }

    /**
     * Get environment summary (quick overview)
     */
    async getSummary(forceRefresh = false): Promise<ContextSummary> {
        const report = await this.getEnvironmentReport(forceRefresh);
        return report.summary;
    }

    /**
     * Check if specific packages are installed
     */
    async checkPackages(packageNames: string[]): Promise<PackageCheckResult[]> {
        const results: PackageCheckResult[] = [];

        for (const name of packageNames) {
            const installed = await isPackageInstalled(name);
            let version: string | undefined;

            if (installed) {
                const info = await getPackageInfo(name);
                version = info?.version;
            }

            results.push({
                name,
                installed,
                version,
            });
        }

        return results;
    }

    /**
     * Check if the environment can support specific analysis types
     */
    async checkCapabilities(): Promise<EnvironmentCapabilities> {
        const report = await this.getEnvironmentReport();
        const packages = new Set(report.libraryResult.libraries.map(l => l.name));

        return {
            dataManipulation: packages.has('dplyr') || packages.has('data.table'),
            visualization: packages.has('ggplot2') || packages.has('plotly'),
            statistics: packages.has('stats'), // always true for R
            machineLearning: packages.has('caret') || packages.has('randomForest') || packages.has('xgboost'),
            reporting: packages.has('rmarkdown') || packages.has('knitr'),
            webApps: packages.has('shiny'),
            database: packages.has('DBI'),
            excelIO: packages.has('readxl') || packages.has('writexl'),
        };
    }

    /**
     * Invalidate cache (call after package installation, etc.)
     */
    invalidateCache(): void {
        this.cachedReport = null;
        this.cacheTime = null;
    }

    /**
     * Update working directory
     */
    setWorkingDir(dir: string): void {
        this.options.workingDir = dir;
        this.invalidateCache();
    }
}

// ============================================
// Singleton Instance
// ============================================

let defaultService: REnvironmentService | null = null;

export function getEnvironmentService(options?: EnvironmentServiceOptions): REnvironmentService {
    if (!defaultService || options) {
        defaultService = new REnvironmentService(options);
    }
    return defaultService;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick function to get system prompt for current directory
 */
export async function getSystemPromptForCurrentDir(
    language: 'en' | 'zh-TW' = 'en'
): Promise<string> {
    const service = new REnvironmentService({
        contextOptions: { language },
    });
    return service.getSystemPrompt();
}

/**
 * Quick function to check R environment health
 */
export async function checkREnvironment(): Promise<RHealthCheck> {
    try {
        const service = new REnvironmentService();
        const summary = await service.getSummary();

        return {
            rAvailable: true,
            rVersion: summary.rVersion,
            packagesCount: summary.totalPackages,
            message: `R ${summary.rVersion} detected with ${summary.totalPackages} packages`,
        };
    } catch (error) {
        return {
            rAvailable: false,
            rVersion: 'unknown',
            packagesCount: 0,
            message: `R not found: ${(error as Error).message}`,
        };
    }
}

export default REnvironmentService;