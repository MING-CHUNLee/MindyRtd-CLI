/**
 * Views: Context Result Formatter
 *
 * Formats context/system-prompt data for CLI display.
 *
 * Design rules (Presentation Layer SKILL.md):
 *   - `formatXxx()` functions are PURE — return string[] only, no console.log.
 *   - `displayXxx()` functions are thin I/O wrappers around formatters.
 *   - No imports from domain/, application/, or infrastructure/.
 *   - Accepts ContextDisplayVM (Presentation View Model) only.
 */

import chalk from 'chalk';
import { ContextDisplayVM, EnvironmentSummaryVM } from '../view-models';
import { formatEnvironmentSummary } from './environment-result';

// ─── Pure Formatters ───────────────────────────────────────────────────────

export function formatContextHeader(): string[] {
    return [
        '',
        chalk.bold.cyan('═══════════════════════════════════════════════════════════════'),
        chalk.bold.cyan('                    CONTEXT PREVIEW                              '),
        chalk.bold.cyan('═══════════════════════════════════════════════════════════════'),
    ];
}

export function formatContextEnvironmentSummary(
    summary: EnvironmentSummaryVM,
    warnings: string[],
): string[] {
    return [
        '',
        chalk.bold.yellow('📊 Environment Summary:'),
        formatEnvironmentSummary(summary, warnings),
    ];
}

export function formatContextPromptStatistics(vm: ContextDisplayVM): string[] {
    const { options, prompt } = vm;
    if (!options.showTokenStats && options.showSummaryOnly) return [];

    return [
        '',
        chalk.bold.yellow('📈 Prompt Statistics:'),
        `   • Estimated Tokens: ${chalk.cyan(prompt.estimatedTokens.toLocaleString())}`,
        `   • Character Count:  ${chalk.cyan(prompt.charCount.toLocaleString())}`,
        `   • Language:         ${chalk.cyan(options.lang)}`,
        `   • Mode:             ${chalk.cyan(options.minimal ? 'Minimal' : 'Full')}`,
    ];
}

export function formatContextFullPrompt(systemPrompt: string): string[] {
    return [
        '',
        chalk.bold.yellow('📝 Generated System Prompt:'),
        chalk.gray('─'.repeat(65)),
        '',
        highlightPrompt(systemPrompt),
        '',
        chalk.gray('─'.repeat(65)),
    ];
}

export function formatContextTips(): string[] {
    return [
        '',
        chalk.gray('💡 Tips:'),
        chalk.gray('   • Use --json for machine-readable output'),
        chalk.gray('   • Use --minimal for smaller prompts'),
        chalk.gray('   • Use --save <filename> to save prompt to file'),
        chalk.gray('   • Use --lang zh-TW for Traditional Chinese'),
    ];
}

/** Format entire text context view as lines. Pure — no I/O. */
export function formatContextAsText(vm: ContextDisplayVM): string[] {
    const lines: string[] = [
        ...formatContextHeader(),
        ...formatContextEnvironmentSummary(vm.summary, vm.warnings),
        ...formatContextPromptStatistics(vm),
    ];

    if (!vm.options.showSummaryOnly) {
        lines.push(...formatContextFullPrompt(vm.prompt.systemPrompt));
    }

    return lines;
}

/** Format context as JSON string. Pure — no I/O. */
export function formatContextAsJson(vm: ContextDisplayVM): string {
    const output = {
        summary: {
            rVersion:       vm.summary.rVersion,
            projectName:    vm.summary.projectName,
            totalPackages:  vm.summary.totalPackages,
            totalFiles:     vm.summary.totalFiles,
            keyPackages:    vm.summary.keyPackages,
            fileTypes:      vm.summary.fileTypes,
        },
        prompt: {
            estimatedTokens: vm.prompt.estimatedTokens,
            length:          vm.prompt.charCount,
            content: vm.options.showSummaryOnly
                ? '[Use --no-summary to see full content]'
                : vm.prompt.systemPrompt,
        },
        warnings:    vm.warnings,
        generatedAt: new Date().toISOString(),
    };
    return JSON.stringify(output, null, 2);
}

/**
 * Highlight Markdown-style syntax in a system prompt string. Pure.
 */
export function highlightPrompt(prompt: string): string {
    return prompt
        .replace(/^# (.+)$/gm,    chalk.bold.magenta('# $1'))
        .replace(/^## (.+)$/gm,   chalk.bold.blue('## $1'))
        .replace(/\*\*([^*]+)\*\*/g, chalk.bold('$1'))
        .replace(/^(- .+)$/gm,    chalk.white('$1'))
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
            chalk.gray('```' + (lang || '')) + '\n' + chalk.green(code) + chalk.gray('```')
        )
        .replace(/`([^`]+)`/g, chalk.cyan('`$1`'))
        .replace(/✓/g, chalk.green('✓'))
        .replace(/✗/g, chalk.red('✗'));
}

// ─── Display (thin I/O wrappers) ──────────────────────────────────────────

export function outputAsJson(vm: ContextDisplayVM): void {
    console.log(formatContextAsJson(vm));
}

export function outputAsText(vm: ContextDisplayVM): void {
    for (const line of formatContextAsText(vm)) {
        console.log(line);
    }
}

export function displayContextHeader(): void {
    for (const line of formatContextHeader()) console.log(line);
}

export function displayContextEnvironmentSummary(
    summary: EnvironmentSummaryVM,
    warnings: string[],
): void {
    for (const line of formatContextEnvironmentSummary(summary, warnings)) {
        console.log(line);
    }
}

export function displayContextPromptStatistics(vm: ContextDisplayVM): void {
    for (const line of formatContextPromptStatistics(vm)) {
        console.log(line);
    }
}

export function displayContextFullPrompt(systemPrompt: string): void {
    for (const line of formatContextFullPrompt(systemPrompt)) {
        console.log(line);
    }
}

export function displayContextTips(): void {
    for (const line of formatContextTips()) console.log(line);
}
