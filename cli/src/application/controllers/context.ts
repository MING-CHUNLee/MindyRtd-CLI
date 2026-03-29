/**
 * Command: context
 *
 * Preview the generated system prompt without calling LLM API.
 * Useful for testing and debugging the context-builder output.
 *
 * Usage:
 *   mindy context              # Preview prompt
 *   mindy context --json       # Output as JSON
 *   mindy context --save       # Save to file
 *   mindy context --lang zh-TW # Chinese prompt
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
import { DISPLAY } from '../../infrastructure/config/constants';
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

        if (options.json) {
            outputAsJson(report, options);
        } else {
            outputAsText(report, options);
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
    const service = new REnvironmentService({
        workingDir: options.dir,
        includeBasePackages: options.includeBase,
        contextOptions: {
            language: options.lang,
            includePackageDetails: !options.minimal,
            includeFilePreview: !options.minimal,
            maxPackagesToList: options.minimal ? DISPLAY.MINIMAL_PACKAGES_LIMIT : DISPLAY.MAX_PACKAGES_TO_LIST,
            maxFilesToList: options.minimal ? DISPLAY.MINIMAL_FILES_LIMIT : DISPLAY.MAX_FILES_TO_LIST,
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
