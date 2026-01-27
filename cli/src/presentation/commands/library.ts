/**
 * Command: library
 *
 * Scans and displays installed R libraries/packages.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { scanLibraries } from '../../core/services/library-scanner';
import { displayLibraryResult } from '../views/library-result';
import { handleError } from '../../shared/utils/error-handler';

// ============================================
// Types
// ============================================

interface LibraryCommandOptions {
    includeBase: boolean;
    filter?: string;
    sort: 'name' | 'version';
    json: boolean;
}

// ============================================
// Command Definition
// ============================================

export const libraryCommand = new Command('library')
    .alias('lib')
    .alias('packages')
    .description('Scan and display installed R libraries/packages')
    .option('--include-base', 'Include base R packages in the results', false)
    .option('-f, --filter <pattern>', 'Filter packages by name pattern')
    .option('-s, --sort <field>', 'Sort by: name, version', 'name')
    .option('-j, --json', 'Output results as JSON', false)
    .action(async (options: LibraryCommandOptions) => {
        await executeLibraryCommand(options);
    });

// ============================================
// Command Execution
// ============================================

async function executeLibraryCommand(options: LibraryCommandOptions): Promise<void> {
    const spinner = ora({
        text: 'Scanning R libraries...',
        color: 'cyan',
    }).start();

    try {
        const result = await scanLibraries({
            includeBase: options.includeBase,
            filter: options.filter,
            sortBy: options.sort,
        });

        spinner.succeed(chalk.green('Library scan complete!'));

        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            displayLibraryResult(result);
        }
    } catch (error) {
        spinner.fail(chalk.red('Library scan failed'));
        handleError(error, 'library scanning');
    }
}
