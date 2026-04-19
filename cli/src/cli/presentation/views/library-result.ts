/**
 * Views: Library Scan Result
 *
 * Formats and displays library scan results to the console.
 *
 * Design rules (Presentation Layer SKILL.md):
 *   - `formatXxx()` functions are PURE — return string[] only, no console.log.
 *   - `displayXxx()` functions are thin I/O wrappers around formatters.
 *   - No imports from domain/, application/, or infrastructure/.
 *   - Accepts LibraryScanResultVM (Presentation View Model) only.
 */

import chalk from 'chalk';
import { LibraryScanResultVM, LibraryInfoVM } from '../../../shared/view-models';

const MAX_LIBRARIES_DISPLAY = 20;

// ─── Pure Formatters ───────────────────────────────────────────────────────

/**
 * Format R environment info section.
 */
export function formatREnvironmentInfo(vm: LibraryScanResultVM): string[] {
    const lines: string[] = [
        chalk.cyan('🔧 R Environment:'),
        `   ${chalk.bold('R Version:')} ${chalk.green(vm.rVersion)}`,
        `   ${chalk.bold('R Home:')} ${vm.rHome}`,
        '',
        chalk.cyan('📁 Library Paths:'),
    ];
    for (const libPath of vm.libraryPaths) {
        lines.push(`   ${chalk.gray('•')} ${libPath}`);
    }
    lines.push('');
    return lines;
}

/**
 * Format library count summary.
 */
export function formatLibrarySummary(vm: LibraryScanResultVM): string[] {
    return [
        chalk.bold('📊 Summary:'),
        chalk.gray('─'.repeat(50)),
        `   📚 ${chalk.yellow(vm.totalLibraries.toString().padStart(4))} Total Libraries`,
        `   🏠 ${chalk.blue(vm.basePackages.toString().padStart(4))} Base/Recommended Packages`,
        `   👤 ${chalk.green(vm.userPackages.toString().padStart(4))} User-Installed Packages`,
        chalk.gray('─'.repeat(50)),
        '',
    ];
}

/**
 * Format library table with header and rows.
 */
export function formatLibraryList(libraries: LibraryInfoVM[]): string[] {
    if (libraries.length === 0) {
        return [chalk.yellow('No libraries found matching the criteria.'), ''];
    }

    const nameHeader    = 'Package Name'.padEnd(30);
    const versionHeader = 'Version'.padEnd(15);
    const typeHeader    = 'Type';

    const lines: string[] = [
        chalk.bold('📚 Installed Libraries:'),
        '',
        chalk.dim(`   ${nameHeader} ${versionHeader} ${typeHeader}`),
        chalk.dim('   ' + '─'.repeat(60)),
    ];

    const displayLibraries = libraries.slice(0, MAX_LIBRARIES_DISPLAY);
    for (const lib of displayLibraries) {
        const name    = lib.name.padEnd(30);
        const version = lib.version.padEnd(15);
        const type    = lib.isBase ? chalk.blue('base') : chalk.green('user');
        lines.push(`   ${chalk.white(name)} ${chalk.gray(version)} ${type}`);
    }

    if (libraries.length > MAX_LIBRARIES_DISPLAY) {
        lines.push('');
        lines.push(chalk.dim(`   ... and ${libraries.length - MAX_LIBRARIES_DISPLAY} more libraries`));
    }
    lines.push('');
    return lines;
}

/**
 * Format library usage tips.
 */
export function formatLibraryNextSteps(): string[] {
    return [
        chalk.cyan.bold('💡 Tips:'),
        chalk.gray('   • Use `--filter <name>` to search for specific packages'),
        chalk.gray('   • Use `--include-base` to show base R packages'),
        chalk.gray('   • Use `--json` to output results as JSON'),
        '',
    ];
}

/**
 * Format entire library scan result as lines. Pure — no I/O.
 */
export function formatLibraryResult(vm: LibraryScanResultVM): string[] {
    return [
        '',
        chalk.bold.underline('📦 R Library Scan Results'),
        '',
        ...formatREnvironmentInfo(vm),
        ...formatLibrarySummary(vm),
        ...formatLibraryList(vm.libraries),
        ...formatLibraryNextSteps(),
    ];
}

/**
 * Format a compact inline list (for embedding in other views). Pure.
 */
export function formatCompactLibraryList(libraries: LibraryInfoVM[], maxItems = 5): string[] {
    const lines: string[] = [chalk.cyan('📦 Key Libraries:')];
    const displayLibs = libraries.slice(0, maxItems);
    for (const lib of displayLibs) {
        lines.push(`   ${chalk.gray('•')} ${lib.name} ${chalk.dim(`(${lib.version})`)}`);
    }
    if (libraries.length > maxItems) {
        lines.push(chalk.dim(`   ... and ${libraries.length - maxItems} more`));
    }
    return lines;
}

// ─── Display (thin I/O wrappers) ──────────────────────────────────────────

export function displayLibraryResult(vm: LibraryScanResultVM): void {
    for (const line of formatLibraryResult(vm)) {
        console.log(line);
    }
}

export function displayCompactLibraryList(libraries: LibraryInfoVM[], maxItems = 5): void {
    for (const line of formatCompactLibraryList(libraries, maxItems)) {
        console.log(line);
    }
}
