/**
 * Views: Scan Result
 *
 * Formats and displays scan results to the console.
 *
 * Design rules (Presentation Layer SKILL.md):
 *   - `formatXxx()` functions are PURE — return string[] only, no console.log.
 *   - `displayXxx()` functions are thin I/O wrappers around formatters.
 *   - No imports from domain/, application/, or infrastructure/.
 *   - Accepts ScanResultVM (Presentation View Model) only.
 */

import chalk from 'chalk';
import { ScanResultVM } from '../../../shared/view-models';
import { formatFileSize, formatRelativePath } from '../../../shared/utils/format';

// ─── Types ─────────────────────────────────────────────────────────────────

interface FileCategory {
    key: keyof Omit<ScanResultVM, 'totalFiles' | 'projectName' | 'projectPath' | 'baseDir' | 'maxFilesDisplay'>;
    label: string;
    icon: string;
    color: chalk.Chalk;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const FILE_CATEGORIES: FileCategory[] = [
    { key: 'rScripts',   label: 'R Scripts (.R)',                   icon: '📜', color: chalk.yellow  },
    { key: 'rMarkdown',  label: 'R Markdown (.Rmd)',                icon: '📝', color: chalk.magenta },
    { key: 'rData',      label: 'R Data (.RData/.rds)',             icon: '💾', color: chalk.blue    },
    { key: 'rProject',   label: 'R Project (.Rproj)',               icon: '📦', color: chalk.green   },
    { key: 'dataFiles',  label: 'Data Files (.csv/.xlsx/.json/...)', icon: '📊', color: chalk.cyan    },
    { key: 'documents',  label: 'Documents (.pdf/.html/.tex)',      icon: '📄', color: chalk.white   },
];

// ─── Pure Formatters ───────────────────────────────────────────────────────

/**
 * Format project info section. Returns empty array when no project detected.
 */
export function formatProjectInfo(vm: ScanResultVM): string[] {
    if (!vm.projectName) return [];
    return [
        chalk.cyan('📊 RStudio Project Detected:'),
        `   ${chalk.bold(vm.projectName)}`,
        `   Path: ${vm.projectPath ?? ''}`,
        '',
    ];
}

/**
 * Format file count summary table.
 */
export function formatScanSummary(vm: ScanResultVM): string[] {
    const lines: string[] = [
        chalk.bold('📈 Summary:'),
        chalk.gray('─'.repeat(50)),
    ];

    for (const cat of FILE_CATEGORIES) {
        const files = vm[cat.key] as Array<{ path: string; size: number }>;
        const count = files.length.toString().padStart(4);
        lines.push(`   ${cat.icon} ${cat.color(count)} ${cat.label}`);
    }

    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(`   ${chalk.bold('Total:')} ${chalk.bold.white(vm.totalFiles.toString())} files found`);
    lines.push('');
    return lines;
}

/**
 * Format detailed file list for each file category.
 */
export function formatScanFileList(vm: ScanResultVM): string[] {
    const lines: string[] = [];

    for (const cat of FILE_CATEGORIES) {
        const files = vm[cat.key] as Array<{ path: string; size: number }>;
        if (files.length === 0) continue;

        lines.push(cat.color.bold(`${cat.icon} ${cat.label}:`));

        const displayFiles = files.slice(0, vm.maxFilesDisplay);
        for (const file of displayFiles) {
            const relativePath = formatRelativePath(file.path, vm.baseDir);
            const size = formatFileSize(file.size);
            lines.push(`   ${chalk.gray('•')} ${relativePath} ${chalk.dim(`(${size})`)}`);
        }

        if (files.length > vm.maxFilesDisplay) {
            lines.push(chalk.dim(`   ... and ${files.length - vm.maxFilesDisplay} more files`));
        }
        lines.push('');
    }
    return lines;
}

/**
 * Format next-steps hint.
 */
export function formatScanNextSteps(): string[] {
    return [
        chalk.cyan.bold('💡 Next Steps:'),
        chalk.gray('   • Use `mindy-cli analyze <file>` to analyze a specific file'),
        chalk.gray('   • Use `mindy-cli analyze --all` to analyze all detected files'),
        '',
    ];
}

/**
 * Format entire scan result as lines. Pure — no I/O.
 */
export function formatScanResult(vm: ScanResultVM): string[] {
    return [
        '',
        chalk.bold.underline('📁 Scan Results'),
        '',
        ...formatProjectInfo(vm),
        ...formatScanSummary(vm),
        ...formatScanFileList(vm),
        ...formatScanNextSteps(),
    ];
}

// ─── Display (thin I/O wrapper) ────────────────────────────────────────────

/**
 * Display full scan result to stdout.
 */
export function displayScanResult(vm: ScanResultVM): void {
    for (const line of formatScanResult(vm)) {
        console.log(line);
    }
}
