/**
 * Command: library
 *
 * Scans and displays installed R libraries/packages.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { scanLibraries } from '../../infrastructure/r-adapter/library-scanner';
import { displayLibraryResult } from '../../presentation/views/library-result';
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
            // Map domain LibraryScanResult → Presentation LibraryScanResultVM (controller responsibility)
            displayLibraryResult({
                rVersion:       result.rVersion,
                rHome:          result.rHome,
                libraryPaths:   result.libraryPaths,
                totalLibraries: result.totalLibraries,
                basePackages:   result.basePackages,
                userPackages:   result.userPackages,
                libraries:      result.libraries.map(lib => ({
                    name:    lib.name,
                    version: lib.version,
                    isBase:  lib.isBase,
                })),
            });
        }
    } catch (error) {
        spinner.fail(chalk.red('Library scan failed'));
        handleError(error, 'library scanning');
    }
}
