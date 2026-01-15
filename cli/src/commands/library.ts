/**
 * Command: library
 * 
 * Scans and displays installed R libraries/packages.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { scanLibraries } from '../services/library-scanner';
import { displayLibraryResult } from '../views/library-result';

export const libraryCommand = new Command('library')
    .alias('lib')
    .alias('packages')
    .description('Scan and display installed R libraries/packages')
    .option('--include-base', 'Include base R packages in the results', false)
    .option('-f, --filter <pattern>', 'Filter packages by name pattern')
    .option('-s, --sort <field>', 'Sort by: name, version', 'name')
    .option('-j, --json', 'Output results as JSON', false)
    .action(async (options) => {
        const spinner = ora({
            text: 'Scanning R libraries...',
            color: 'cyan',
        }).start();

        try {
            const result = await scanLibraries({
                includeBase: options.includeBase,
                filter: options.filter,
                sortBy: options.sort as 'name' | 'version',
            });

            spinner.succeed(chalk.green('Library scan complete!'));

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                displayLibraryResult(result);
            }
        } catch (error) {
            spinner.fail(chalk.red('Library scan failed'));
            console.error(chalk.red(`Error: ${(error as Error).message}`));

            // Provide helpful error messages
            if ((error as Error).message.includes('R is not installed')) {
                console.log('');
                console.log(chalk.yellow('💡 Tip: Make sure R is installed and accessible in your PATH.'));
                console.log(chalk.gray('   Download R from: https://cran.r-project.org/'));
            }

            process.exit(1);
        }
    });
