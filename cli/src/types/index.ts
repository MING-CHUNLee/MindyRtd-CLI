/**
 * Type definitions for Mindy RStudio CLI
 *
 * These types define the data structures used throughout the CLI.
 * In the future, these may be shared with or replaced by API response types.
 */

export { FileInfo, createFileInfo } from './file-info';
export { ProjectInfo, createProjectInfo } from './project-info';
export { ScanResult, RFileCollection, ScanResultProps, createScanResult } from './scan-result';

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
