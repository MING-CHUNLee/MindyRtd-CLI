/**
 * Views: Scan Result Display
 *
 * Formats and displays scan results to the console.
 */

import chalk from 'chalk';
import { ScanResult } from '../types';
import { formatFileSize, formatRelativePath } from '../utils/format';
import { DISPLAY } from '../config/constants';

// ============================================
// Types
// ============================================

interface FileCategory {
    key: keyof ScanResult['files'];
    label: string;
    icon: string;
    color: chalk.Chalk;
}

// ============================================
// Constants
// ============================================

const FILE_CATEGORIES: FileCategory[] = [
    { key: 'rScripts', label: 'R Scripts (.R)', icon: '📜', color: chalk.yellow },
    { key: 'rMarkdown', label: 'R Markdown (.Rmd)', icon: '📝', color: chalk.magenta },
    { key: 'rData', label: 'R Data (.RData/.rds)', icon: '💾', color: chalk.blue },
    { key: 'rProject', label: 'R Project (.Rproj)', icon: '📦', color: chalk.green },
];

// ============================================
// Display Functions
// ============================================

export function displayScanResult(result: ScanResult, baseDir: string): void {
    console.log('');
    console.log(chalk.bold.underline('📁 Scan Results'));
    console.log('');

    displayProjectInfo(result);
    displaySummary(result);
    displayFileList(result, baseDir);
    displayNextSteps();
}

/**
 * Display project information if detected
 */
function displayProjectInfo(result: ScanResult): void {
    if (result.projectInfo) {
        console.log(chalk.cyan('📊 RStudio Project Detected:'));
        console.log(`   ${chalk.bold(result.projectInfo.name)}`);
        console.log(`   Path: ${result.projectInfo.path}`);
        console.log('');
    }
}

/**
 * Display summary of file counts
 */
function displaySummary(result: ScanResult): void {
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
}

/**
 * Display detailed file list for each category
 */
function displayFileList(result: ScanResult, baseDir: string): void {
    for (const cat of FILE_CATEGORIES) {
        const files = result.files[cat.key];
        if (files.length > 0) {
            console.log(cat.color.bold(`${cat.icon} ${cat.label}:`));

            const displayFiles = files.slice(0, DISPLAY.MAX_FILES_DISPLAY);
            for (const file of displayFiles) {
                const relativePath = formatRelativePath(file.path, baseDir);
                const size = formatFileSize(file.size);
                console.log(`   ${chalk.gray('•')} ${relativePath} ${chalk.dim(`(${size})`)}`);
            }

            if (files.length > DISPLAY.MAX_FILES_DISPLAY) {
                console.log(chalk.dim(`   ... and ${files.length - DISPLAY.MAX_FILES_DISPLAY} more files`));
            }
            console.log('');
        }
    }
}

/**
 * Display next steps hint
 */
function displayNextSteps(): void {
    console.log(chalk.cyan.bold('💡 Next Steps:'));
    console.log(chalk.gray('   • Use `mindy-cli analyze <file>` to analyze a specific file'));
    console.log(chalk.gray('   • Use `mindy-cli analyze --all` to analyze all detected files'));
    console.log('');
}
