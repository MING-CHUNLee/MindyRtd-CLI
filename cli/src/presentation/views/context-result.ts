/**
 * View: Context Result Formatter
 *
 * Formats context/system-prompt data for CLI display.
 * Pure functions — no state, no I/O other than console.log.
 */

import chalk from 'chalk';
import { EnvironmentReport } from '../../application/services/r-environment-service';
import { formatEnvironmentSummary } from './environment-result';

interface ContextDisplayOptions {
    summary: boolean;
    tokens: boolean;
    lang: string;
    minimal: boolean;
}

export function outputAsJson(report: EnvironmentReport, options: ContextDisplayOptions): void {
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

export function outputAsText(report: EnvironmentReport, options: ContextDisplayOptions): void {
    const { prompt, summary, warnings } = report;

    displayContextHeader();
    displayContextEnvironmentSummary(summary, warnings);
    displayContextPromptStatistics(prompt, options);

    if (!options.summary) {
        displayContextFullPrompt(prompt.systemPrompt);
    }
}

export function displayContextHeader(): void {
    console.log('');
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
    console.log(chalk.bold.cyan('                    CONTEXT PREVIEW                              '));
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
}

export function displayContextEnvironmentSummary(
    summary: EnvironmentReport['summary'],
    warnings: string[]
): void {
    console.log('');
    console.log(chalk.bold.yellow('📊 Environment Summary:'));
    console.log(formatEnvironmentSummary(summary, warnings));
}

export function displayContextPromptStatistics(
    prompt: EnvironmentReport['prompt'],
    options: ContextDisplayOptions
): void {
    if (!options.tokens && options.summary) return;

    console.log('');
    console.log(chalk.bold.yellow('📈 Prompt Statistics:'));
    console.log(`   • Estimated Tokens: ${chalk.cyan(prompt.estimatedTokens.toLocaleString())}`);
    console.log(`   • Character Count:  ${chalk.cyan(prompt.systemPrompt.length.toLocaleString())}`);
    console.log(`   • Language:         ${chalk.cyan(options.lang)}`);
    console.log(`   • Mode:             ${chalk.cyan(options.minimal ? 'Minimal' : 'Full')}`);
}

export function displayContextFullPrompt(systemPrompt: string): void {
    console.log('');
    console.log(chalk.bold.yellow('📝 Generated System Prompt:'));
    console.log(chalk.gray('─'.repeat(65)));
    console.log('');
    console.log(highlightPrompt(systemPrompt));
    console.log('');
    console.log(chalk.gray('─'.repeat(65)));
}

export function displayContextTips(): void {
    console.log('');
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('   • Use --json for machine-readable output'));
    console.log(chalk.gray('   • Use --minimal for smaller prompts'));
    console.log(chalk.gray('   • Use --save <filename> to save prompt to file'));
    console.log(chalk.gray('   • Use --lang zh-TW for Traditional Chinese'));
}

export function highlightPrompt(prompt: string): string {
    return prompt
        .replace(/^# (.+)$/gm, chalk.bold.magenta('# $1'))
        .replace(/^## (.+)$/gm, chalk.bold.blue('## $1'))
        .replace(/\*\*([^*]+)\*\*/g, chalk.bold('$1'))
        .replace(/^(- .+)$/gm, chalk.white('$1'))
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
            chalk.gray('```' + (lang || '')) + '\n' + chalk.green(code) + chalk.gray('```')
        )
        .replace(/`([^`]+)`/g, chalk.cyan('`$1`'))
        .replace(/✓/g, chalk.green('✓'))
        .replace(/✗/g, chalk.red('✗'));
}
