/**
 * Command: scan
 * 
 * Scans the current directory for R-related files.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { scanDirectory } from '../services/file-scanner';
import { displayScanResult } from '../views/scan-result';

export const scanCommand = new Command('scan')
    .description('Scan current directory for R-related files (.R, .Rmd, .RData, .Rproj)')
    .option('-d, --directory <path>', 'Target directory to scan', '.')
    .option('-r, --recursive', 'Scan subdirectories recursively', true)
    .option('--no-recursive', 'Only scan top-level directory')
    .option('-j, --json', 'Output results as JSON', false)
    .option('--include-hidden', 'Include hidden files and directories', false)
    .action(async (options) => {
        const spinner = ora({
            text: 'Scanning for R files...',
            color: 'cyan',
        }).start();

        try {
            const result = await scanDirectory({
                targetDir: options.directory,
                recursive: options.recursive,
                includeHidden: options.includeHidden,
            });

            spinner.succeed(chalk.green('Scan complete!'));

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                displayScanResult(result, options.directory);
            }
        } catch (error) {
            spinner.fail(chalk.red('Scan failed'));
            console.error(chalk.red(`Error: ${(error as Error).message}`));
            process.exit(1);
        }
    });
