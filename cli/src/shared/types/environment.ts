/**
 * Type definitions for R Environment Service
 * 
 * Defines the data structures for environment scanning and reporting.
 */

import { EnvironmentContext, GeneratedPrompt, ContextSummary, ContextBuilderOptions } from './prompt-context';
import { LibraryScanResult } from './library-info';
import { ScanResult } from './scan-result';

/**
 * Options for configuring the R Environment Service
 */
export interface EnvironmentServiceOptions {
    /** Working directory to scan */
    workingDir?: string;
    /** Include base R packages */
    includeBasePackages?: boolean;
    /** Recursive file scanning */
    recursiveScan?: boolean;
    /** Context builder options */
    contextOptions?: ContextBuilderOptions;
}

/**
 * Complete environment report combining all scan results
 */
export interface EnvironmentReport {
    /** Complete environment context */
    context: EnvironmentContext;
    /** Generated system prompt */
    prompt: GeneratedPrompt;
    /** Raw library scan result */
    libraryResult: LibraryScanResult;
    /** Raw file scan result */
    fileResult: ScanResult;
    /** Quick access to summary */
    summary: ContextSummary;
    /** Any warnings during scanning */
    warnings: string[];
}

/**
 * Result of checking a single package
 */
export interface PackageCheckResult {
    name: string;
    installed: boolean;
    version?: string;
    capabilities?: string[];
}

/**
 * Result of R environment health check
 */
export interface RHealthCheck {
    rAvailable: boolean;
    rVersion: string;
    packagesCount: number;
    message: string;
}

/**
 * Environment capabilities based on installed packages
 */
export interface EnvironmentCapabilities {
    dataManipulation: boolean;
    visualization: boolean;
    statistics: boolean;
    machineLearning: boolean;
    reporting: boolean;
    webApps: boolean;
    database: boolean;
    excelIO: boolean;
}
