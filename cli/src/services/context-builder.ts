/**
 * Service: Context Builder
 * 
 * Integrates environment information from library-scanner and file-scanner
 * to generate dynamic System Prompts for LLM interactions.
 * 
 * This solves the professor's challenge: "help the LLM communicate with 
 * the client side to figure out what is available and what can be done"
 * 
 * Architecture Note:
 * - Types are defined in /types/context.ts
 * - Static data is in /data/package-capabilities.ts
 * - Prompt templates are in /templates/
 * - This service orchestrates them together (Clean Architecture pattern)
 */

import { LibraryScanResult } from '../types/library-info';
import { ScanResult } from '../types';
import {
    ContextBuilderOptions,
    EnvironmentContext,
    GeneratedPrompt,
    ContextSummary,
} from '../types/prompt-context';
import { loadLocale } from '../templates/locale-loader';
import {
    buildRoleSection,
    buildEnvironmentSection,
    buildCapabilitiesSection,
    buildFileContextSection,
    buildConstraintsSection,
    buildCustomSection,
    identifyKeyPackages,
    estimateTokens,
} from '../templates/prompts';

// Re-export types for backward compatibility
export {
    ContextBuilderOptions,
    EnvironmentContext,
    GeneratedPrompt,
    ContextSummary,
} from '../types/prompt-context';

// ============================================
// Context Builder Class
// ============================================

export class ContextBuilder {
    private options: Required<ContextBuilderOptions>;

    constructor(options: ContextBuilderOptions = {}) {
        this.options = {
            includePackageDetails: options.includePackageDetails ?? true,
            maxPackagesToList: options.maxPackagesToList ?? 50,
            includeFilePreview: options.includeFilePreview ?? true,
            maxFilesToList: options.maxFilesToList ?? 20,
            includeCapabilities: options.includeCapabilities ?? true,
            customInstructions: options.customInstructions ?? '',
            language: options.language ?? 'en',
        };
    }

    /**
     * Build complete environment context from scanner results
     */
    buildContext(
        libraryResult: LibraryScanResult,
        fileResult: ScanResult
    ): EnvironmentContext {
        return {
            rEnvironment: libraryResult,
            fileContext: fileResult,
            workingDirectory: fileResult.baseDirectory,
            generatedAt: new Date(),
        };
    }

    /**
     * Generate System Prompt from environment context
     */
    generatePrompt(context: EnvironmentContext): GeneratedPrompt {
        const locale = loadLocale(this.options.language);
        const sections: string[] = [];

        // 1. Role Definition
        sections.push(buildRoleSection(locale));

        // 2. Environment Information
        sections.push(buildEnvironmentSection(
            context.rEnvironment,
            locale,
            {
                includePackageDetails: this.options.includePackageDetails,
                maxPackagesToList: this.options.maxPackagesToList,
            }
        ));

        // 3. Available Capabilities
        if (this.options.includeCapabilities) {
            sections.push(buildCapabilitiesSection(context.rEnvironment, locale));
        }

        // 4. File Context
        sections.push(buildFileContextSection(
            context.fileContext,
            locale,
            {
                includeFilePreview: this.options.includeFilePreview,
                maxFilesToList: this.options.maxFilesToList,
            }
        ));

        // 5. Constraints & Guidelines
        sections.push(buildConstraintsSection(locale));

        // 6. Custom Instructions
        if (this.options.customInstructions) {
            sections.push(buildCustomSection(this.options.customInstructions, locale));
        }

        const systemPrompt = sections.join('\n\n');
        const contextSummary = this.buildSummary(context);

        return {
            systemPrompt,
            contextSummary,
            estimatedTokens: estimateTokens(systemPrompt),
        };
    }

    /**
     * Build context summary for quick reference
     */
    private buildSummary(context: EnvironmentContext): ContextSummary {
        const { rEnvironment, fileContext } = context;
        const packages = rEnvironment.libraries;

        return {
            rVersion: rEnvironment.rVersion,
            totalPackages: packages.length,
            keyPackages: identifyKeyPackages(packages),
            totalFiles: fileContext.totalFiles,
            fileTypes: {
                'R Scripts': fileContext.files.rScripts?.length || 0,
                'R Markdown': fileContext.files.rMarkdown?.length || 0,
                'R Data': fileContext.files.rData?.length || 0,
            },
            projectName: fileContext.projectInfo?.name || null,
        };
    }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick function to generate a system prompt from scanner results
 */
export function generateSystemPrompt(
    libraryResult: LibraryScanResult,
    fileResult: ScanResult,
    options?: ContextBuilderOptions
): GeneratedPrompt {
    const builder = new ContextBuilder(options);
    const context = builder.buildContext(libraryResult, fileResult);
    return builder.generatePrompt(context);
}

/**
 * Generate a minimal prompt (smaller token count)
 */
export function generateMinimalPrompt(
    libraryResult: LibraryScanResult,
    fileResult: ScanResult,
    language: 'en' | 'zh-TW' = 'en'
): GeneratedPrompt {
    const locale = loadLocale(language);

    return generateSystemPrompt(libraryResult, fileResult, {
        includePackageDetails: false,
        includeFilePreview: false,
        includeCapabilities: true,
        maxPackagesToList: 10,
        maxFilesToList: 5,
        language,
        customInstructions: locale.minimal.note,
    });
}

export default ContextBuilder;