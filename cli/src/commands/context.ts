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
import * as fs from 'fs';
import * as path from 'path';
import { REnvironmentService, EnvironmentReport } from '../services/r-environment-service';
import { formatEnvironmentSummary } from '../views/environment-result';
import { DISPLAY } from '../config/constants';
import { handleError } from '../utils/error-handler';

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

        displayTips();
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
// Output Functions
// ============================================

function outputAsJson(report: EnvironmentReport, options: ContextOptions): void {
    const { prompt, summary, warnings } = report;

    const output = {
        summary: {
            rVersion: summary.rVersion,
            projectName: summary.projectName,
            totalPackages: summary.totalPackages,
            totalFiles: summary.totalFiles,
            keyPackages: summary.keyPackages,
            fileTypes: summary.fileTypes,
        },
        prompt: {
            estimatedTokens: prompt.estimatedTokens,
            length: prompt.systemPrompt.length,
            content: options.summary ? '[Use --no-summary to see full content]' : prompt.systemPrompt,
        },
        warnings,
        generatedAt: new Date().toISOString(),
    };

    console.log(JSON.stringify(output, null, 2));
}

function outputAsText(report: EnvironmentReport, options: ContextOptions): void {
    const { prompt, summary, warnings } = report;

    displayHeader();
    displayEnvironmentSummary(summary, warnings);
    displayPromptStatistics(prompt, options);

    if (!options.summary) {
        displayFullPrompt(prompt.systemPrompt);
    }
}

function displayHeader(): void {
    console.log('');
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
    console.log(chalk.bold.cyan('                    CONTEXT PREVIEW                              '));
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
}

function displayEnvironmentSummary(summary: EnvironmentReport['summary'], warnings: string[]): void {
    console.log('');
    console.log(chalk.bold.yellow('📊 Environment Summary:'));
    console.log(formatEnvironmentSummary(summary, warnings));
}

function displayPromptStatistics(
    prompt: EnvironmentReport['prompt'],
    options: ContextOptions
): void {
    if (!options.tokens && options.summary) return;

    console.log('');
    console.log(chalk.bold.yellow('📈 Prompt Statistics:'));
    console.log(`   • Estimated Tokens: ${chalk.cyan(prompt.estimatedTokens.toLocaleString())}`);
    console.log(`   • Character Count:  ${chalk.cyan(prompt.systemPrompt.length.toLocaleString())}`);
    console.log(`   • Language:         ${chalk.cyan(options.lang)}`);
    console.log(`   • Mode:             ${chalk.cyan(options.minimal ? 'Minimal' : 'Full')}`);
}

function displayFullPrompt(systemPrompt: string): void {
    console.log('');
    console.log(chalk.bold.yellow('📝 Generated System Prompt:'));
    console.log(chalk.gray('─'.repeat(65)));
    console.log('');
    console.log(highlightPrompt(systemPrompt));
    console.log('');
    console.log(chalk.gray('─'.repeat(65)));
}

function displayTips(): void {
    console.log('');
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('   • Use --json for machine-readable output'));
    console.log(chalk.gray('   • Use --minimal for smaller prompts'));
    console.log(chalk.gray('   • Use --save <filename> to save prompt to file'));
    console.log(chalk.gray('   • Use --lang zh-TW for Traditional Chinese'));
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

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    console.log('');
    console.log(chalk.green(`✓ Prompt saved to: ${filePath}`));
}

// ============================================
// Syntax Highlighting
// ============================================

/**
 * Add syntax highlighting to the prompt for better readability
 */
function highlightPrompt(prompt: string): string {
    return prompt
        // Highlight headers
        .replace(/^# (.+)$/gm, chalk.bold.magenta('# $1'))
        .replace(/^## (.+)$/gm, chalk.bold.blue('## $1'))
        // Highlight bold text
        .replace(/\*\*([^*]+)\*\*/g, chalk.bold('$1'))
        // Highlight bullet points
        .replace(/^(- .+)$/gm, chalk.white('$1'))
        // Highlight code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
            chalk.gray('```' + (lang || '')) + '\n' + chalk.green(code) + chalk.gray('```')
        )
        // Highlight inline code
        .replace(/`([^`]+)`/g, chalk.cyan('`$1`'))
        // Highlight checkmarks
        .replace(/✓/g, chalk.green('✓'))
        .replace(/✗/g, chalk.red('✗'));
}
