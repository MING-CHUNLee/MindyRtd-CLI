/**
 * Views: Scan Result Display
 * 
 * Formats and displays scan results to the console.
 */

import chalk from 'chalk';
import * as path from 'path';
import { ScanResult, FileInfo } from '../types';

interface FileCategory {
    key: keyof ScanResult['files'];
    label: string;
    icon: string;
    color: chalk.Chalk;
}

const FILE_CATEGORIES: FileCategory[] = [
    { key: 'rScripts', label: 'R Scripts (.R)', icon: '📜', color: chalk.yellow },
    { key: 'rMarkdown', label: 'R Markdown (.Rmd)', icon: '📝', color: chalk.magenta },
    { key: 'rData', label: 'R Data (.RData/.rds)', icon: '💾', color: chalk.blue },
    { key: 'rProject', label: 'R Project (.Rproj)', icon: '📦', color: chalk.green },
];

const MAX_FILES_DISPLAY = 10;

export function displayScanResult(result: ScanResult, baseDir: string): void {
    console.log('');
    console.log(chalk.bold.underline('📁 Scan Results'));
    console.log('');

    // Project info
    if (result.projectInfo) {
        console.log(chalk.cyan('📊 RStudio Project Detected:'));
        console.log(`   ${chalk.bold(result.projectInfo.name)}`);
        console.log(`   Path: ${result.projectInfo.path}`);
        console.log('');
    }

    // Summary
    console.log(chalk.bold('📈 Summary:'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const cat of FILE_CATEGORIES) {
        const files = result.files[cat.key];
        const count = files.length.toString().padStart(4);
        console.log(`   ${cat.icon} ${cat.color(count)} ${cat.label}`);
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(`   ${chalk.bold('Total:')} ${chalk.bold.white(result.totalFiles.toString())} files found`);
    console.log('');

    // File lists
    for (const cat of FILE_CATEGORIES) {
        const files = result.files[cat.key];
        if (files.length > 0) {
            console.log(cat.color.bold(`${cat.icon} ${cat.label}:`));

            const displayFiles = files.slice(0, MAX_FILES_DISPLAY);
            for (const file of displayFiles) {
                const relativePath = formatRelativePath(file.path, baseDir);
                const size = formatFileSize(file.size);
                console.log(`   ${chalk.gray('•')} ${relativePath} ${chalk.dim(`(${size})`)}`);
            }

            if (files.length > MAX_FILES_DISPLAY) {
                console.log(chalk.dim(`   ... and ${files.length - MAX_FILES_DISPLAY} more files`));
            }
            console.log('');
        }
    }

    // Next steps
    console.log(chalk.cyan.bold('💡 Next Steps:'));
    console.log(chalk.gray('   • Use `mindy-cli analyze <file>` to analyze a specific file'));
    console.log(chalk.gray('   • Use `mindy-cli analyze --all` to analyze all detected files'));
    console.log('');
}

function formatRelativePath(filePath: string, baseDir: string): string {
    const resolvedBase = path.resolve(baseDir);
    const resolvedFile = path.resolve(filePath);

    if (resolvedFile.startsWith(resolvedBase)) {
        const rel = path.relative(resolvedBase, resolvedFile);
        return rel || path.basename(filePath);
    }
    return filePath;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
    return `${size} ${units[i]}`;
}
