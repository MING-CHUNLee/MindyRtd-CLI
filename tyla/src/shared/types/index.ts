/**
 * Type definitions for Tyla RStudio CLI
 *
 * These types define the data structures used throughout the CLI.
 * In the future, these may be shared with or replaced by API response types.
 */

export type { FileInfo } from './file-info';
export { createFileInfo } from './file-info';
export type { ProjectInfo } from './project-info';
export { createProjectInfo } from './project-info';
export type { ScanResult, RFileCollection, ScanResultProps } from './scan-result';
export { createScanResult } from './scan-result';
export type {
    LibraryInfo,
    LibraryScanResult,
    LibraryScanOptions,
} from './library-info';
export {
    createLibraryInfo,
    createLibraryScanResult,
} from './library-info';
export type {
    ContextBuilderOptions,
    EnvironmentContext,
    GeneratedPrompt,
    ContextSummary,
    CapabilityGroup,
    SupportedLanguage,
} from './prompt-context';
export type {
    EnvironmentServiceOptions,
    EnvironmentReport,
    PackageCheckResult,
    RHealthCheck,
    EnvironmentCapabilities,
} from './environment';

/**
 * Options for scan operation
 */
export interface ScanOptions {
    targetDir: string;
    recursive: boolean;
    includeHidden: boolean;
}

/**
 * Analysis result from LLM (future use)
 */
export interface AnalysisResult {
    fileId: string;
    suggestions: Suggestion[];
    summary: string;
    analyzedAt: Date;
}

/**
 * Single suggestion from analysis
 */
export interface Suggestion {
    type: 'improvement' | 'warning' | 'error' | 'style';
    severity: 'low' | 'medium' | 'high';
    lineNumber?: number;
    message: string;
    suggestedCode?: string;
    explanation?: string;
}

export type { LLMRequestPayload } from './llm-types';
export type { SessionMessage } from './messages';

/**
 * CLI configuration
 */
export interface CLIConfig {
    apiEndpoint: string;
    apiKey?: string;
    defaultModel: string;
    outputFormat: 'text' | 'json';
    colorOutput: boolean;
}
