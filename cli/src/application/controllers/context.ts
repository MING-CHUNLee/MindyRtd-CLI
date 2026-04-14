/**
 * Command: context
 *
 * Preview the generated system prompt without calling LLM API.
 * Useful for testing and debugging the context-builder output.
 *
 * Usage:
 *   mindy r context              # Preview prompt
 *   mindy r context --json       # Output as JSON
 *   mindy r context --save       # Save to file
 *   mindy r context --lang zh-TW # Chinese prompt
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { REnvironmentService, EnvironmentReport } from '../../application/services/r-environment-service';
import { LocalFileSystem } from '../../infrastructure/filesystem/local-file-system';
import {
    outputAsJson,
    outputAsText,
    displayContextTips,
} from '../../presentation/views/context-result';
import { ContextDisplayVM } from '../../presentation/view-models';
import { handleError } from '../../shared/utils/error-handler';

// ============================================
// Types
// ============================================

interface ContextOptions {
    dir: string;
    lang: 'en' | 'zh-TW';
    includeBase: boolean;
    json: boolean;
    save?: string;
    minimal: boolean;
    summary: boolean;
    tokens: boolean;
}

// ============================================
// Command Definition
// ============================================

export const contextCommand = new Command('context')
    .alias('ctx')
    .alias('prompt')
    .description('Preview the generated system prompt (for testing without LLM)')
    .option('-d, --dir <directory>', 'Target directory to scan', process.cwd())
    .option('-l, --lang <language>', 'Prompt language: en, zh-TW', 'en')
    .option('--include-base', 'Include base R packages', false)
    .option('-j, --json', 'Output as JSON', false)
    .option('-s, --save <filename>', 'Save prompt to file')
    .option('--minimal', 'Generate minimal prompt (fewer tokens)', false)
    .option('--summary', 'Show only summary, not full prompt', false)
    .option('--tokens', 'Show estimated token count', false)
    .action(async (options: ContextOptions) => {
        await executeContextCommand(options);
    });

// ============================================
// Command Execution
// ============================================

async function executeContextCommand(options: ContextOptions): Promise<void> {
    const spinner = ora({
        text: 'Scanning environment and building context...',
        color: 'cyan',
    }).start();

    try {
        const report = await buildEnvironmentReport(options);
        spinner.succeed(chalk.green('Context built successfully!'));

        // Map EnvironmentReport → ContextDisplayVM (Application → Presentation boundary)
        const vm: ContextDisplayVM = {
            summary: {
                rVersion:      report.summary.rVersion,
                projectName:   report.summary.projectName ?? '',
                totalPackages: report.summary.totalPackages,
                totalFiles:    report.summary.totalFiles,
                keyPackages:   report.summary.keyPackages,
                fileTypes: {
                    rScripts:  report.summary.fileTypes['R Scripts'] ?? 0,
                    rMarkdown: report.summary.fileTypes['R Markdown'] ?? 0,
                    rData:     report.summary.fileTypes['R Data'] ?? 0,
                },
            },
            prompt: {
                estimatedTokens: report.prompt.estimatedTokens,
                charCount:       report.prompt.systemPrompt.length,
                systemPrompt:    report.prompt.systemPrompt,
            },
            warnings: report.warnings,
            options: {
                showSummaryOnly: options.summary,
                showTokenStats:  options.tokens,
                lang:            options.lang,
                minimal:         options.minimal,
            },
        };

        if (options.json) {
            outputAsJson(vm);
        } else {
            outputAsText(vm);
        }

        if (options.save) {
            await saveToFile(report, options);
        }

        displayContextTips();
    } catch (error) {
        spinner.fail(chalk.red('Failed to build context'));
        handleError(error, 'context generation');
    }
}

// ============================================
// Report Building
// ============================================

async function buildEnvironmentReport(options: ContextOptions): Promise<EnvironmentReport> {
    // Inline constants (previously in DISPLAY from infrastructure/config/constants)
    const MAX_PACKAGES = options.minimal ? 10 : 50;
    const MAX_FILES    = options.minimal ?  5 : 20;

    const service = new REnvironmentService({
        workingDir: options.dir,
        includeBasePackages: options.includeBase,
        contextOptions: {
            language: options.lang,
            includePackageDetails: !options.minimal,
            includeFilePreview:    !options.minimal,
            maxPackagesToList: MAX_PACKAGES,
            maxFilesToList:    MAX_FILES,
        },
    });

    return service.getEnvironmentReport();
}


// ============================================
// File Operations
// ============================================

async function saveToFile(report: EnvironmentReport, options: ContextOptions): Promise<void> {
    const { prompt } = report;
    const filename = options.save!.endsWith('.md') ? options.save! : `${options.save}.md`;
    const filePath = path.resolve(process.cwd(), filename);

    const fileContent = `# Generated System Prompt

Generated at: ${new Date().toISOString()}
Language: ${options.lang}
Mode: ${options.minimal ? 'Minimal' : 'Full'}
Estimated Tokens: ${prompt.estimatedTokens}

---

${prompt.systemPrompt}
`;

    new LocalFileSystem().write(filePath, fileContent);
    console.log('');
    console.log(chalk.green(`✓ Prompt saved to: ${filePath}`));
}
