/**
 * Type definitions for Context Builder
 * 
 * Defines the data structures for environment context and prompt generation.
 */

import { LibraryScanResult } from './library-info';
import { ScanResult } from './scan-result';

/**
 * Options for context building and prompt generation
 */
export interface ContextBuilderOptions {
    /** Include detailed package list in prompt */
    includePackageDetails?: boolean;
    /** Maximum number of packages to list individually */
    maxPackagesToList?: number;
    /** Include file contents preview */
    includeFilePreview?: boolean;
    /** Maximum files to list */
    maxFilesToList?: number;
    /** Include R capabilities based on installed packages */
    includeCapabilities?: boolean;
    /** Custom instructions to append */
    customInstructions?: string;
    /** Language for the prompt (default: 'en') */
    language?: 'en' | 'zh-TW';
}

/**
 * Complete environment context combining R environment and file information
 */
export interface EnvironmentContext {
    /** R environment information */
    rEnvironment: LibraryScanResult;
    /** File scan results */
    fileContext: ScanResult;
    /** Current working directory */
    workingDirectory: string;
    /** Timestamp of context generation */
    generatedAt: Date;
}

/**
 * Generated prompt with metadata
 */
export interface GeneratedPrompt {
    /** The complete system prompt */
    systemPrompt: string;
    /** Summary of included context */
    contextSummary: ContextSummary;
    /** Token estimate (rough) */
    estimatedTokens: number;
}

/**
 * Summary of the context for quick reference
 */
export interface ContextSummary {
    rVersion: string;
    totalPackages: number;
    keyPackages: string[];
    totalFiles: number;
    fileTypes: Record<string, number>;
    projectName: string | null;
}

/**
 * Capability group with availability status
 */
export interface CapabilityGroup {
    category: string;
    available: boolean;
}

/**
 * Supported languages for prompts
 */
export type SupportedLanguage = 'en' | 'zh-TW';
