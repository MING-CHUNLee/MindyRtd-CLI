/**
 * Views: Library Scan Result Display
 * 
 * Formats and displays library scan results to the console.
 */

import chalk from 'chalk';
import { LibraryScanResult, LibraryInfo } from '../types/library-info';

const MAX_LIBRARIES_DISPLAY = 20;

/**
 * Display library scan results
 */
export function displayLibraryResult(result: LibraryScanResult): void {
    console.log('');
    console.log(chalk.bold.underline('📦 R Library Scan Results'));
    console.log('');

    // R Environment Info
    displayREnvironmentInfo(result);

    // Library Summary
    displayLibrarySummary(result);

    // Library List
    displayLibraryList(result.libraries);

    // Next Steps
    displayNextSteps();
}

/**
 * Display R environment information
 */
function displayREnvironmentInfo(result: LibraryScanResult): void {
    console.log(chalk.cyan('🔧 R Environment:'));
    console.log(`   ${chalk.bold('R Version:')} ${chalk.green(result.rVersion)}`);
    console.log(`   ${chalk.bold('R Home:')} ${result.rHome}`);
    console.log('');

    console.log(chalk.cyan('📁 Library Paths:'));
    for (const libPath of result.libraryPaths) {
        console.log(`   ${chalk.gray('•')} ${libPath}`);
    }
    console.log('');
}

/**
 * Display library summary
 */
function displayLibrarySummary(result: LibraryScanResult): void {
    console.log(chalk.bold('📊 Summary:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`   📚 ${chalk.yellow(result.totalLibraries.toString().padStart(4))} Total Libraries`);
    console.log(`   🏠 ${chalk.blue(result.basePackages.toString().padStart(4))} Base/Recommended Packages`);
    console.log(`   👤 ${chalk.green(result.userPackages.toString().padStart(4))} User-Installed Packages`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');
}

/**
 * Display library list
 */
function displayLibraryList(libraries: LibraryInfo[]): void {
    if (libraries.length === 0) {
        console.log(chalk.yellow('No libraries found matching the criteria.'));
        console.log('');
        return;
    }

    console.log(chalk.bold('📚 Installed Libraries:'));
    console.log('');

    // Header
    const nameHeader = 'Package Name'.padEnd(30);
    const versionHeader = 'Version'.padEnd(15);
    const typeHeader = 'Type';
    console.log(chalk.dim(`   ${nameHeader} ${versionHeader} ${typeHeader}`));
    console.log(chalk.dim('   ' + '─'.repeat(60)));

    // Library rows
    const displayLibraries = libraries.slice(0, MAX_LIBRARIES_DISPLAY);
    for (const lib of displayLibraries) {
        const name = lib.name.padEnd(30);
        const version = lib.version.padEnd(15);
        const type = lib.isBase ? chalk.blue('base') : chalk.green('user');

        console.log(`   ${chalk.white(name)} ${chalk.gray(version)} ${type}`);
    }

    if (libraries.length > MAX_LIBRARIES_DISPLAY) {
        console.log('');
        console.log(chalk.dim(`   ... and ${libraries.length - MAX_LIBRARIES_DISPLAY} more libraries`));
    }
    console.log('');
}

/**
 * Display next steps
 */
function displayNextSteps(): void {
    console.log(chalk.cyan.bold('💡 Tips:'));
    console.log(chalk.gray('   • Use `--filter <name>` to search for specific packages'));
    console.log(chalk.gray('   • Use `--include-base` to show base R packages'));
    console.log(chalk.gray('   • Use `--json` to output results as JSON'));
    console.log('');
}

/**
 * Display compact library list (for embedding in other views)
 */
export function displayCompactLibraryList(libraries: LibraryInfo[], maxItems: number = 5): void {
    console.log(chalk.cyan('📦 Key Libraries:'));

    const displayLibs = libraries.slice(0, maxItems);
    for (const lib of displayLibs) {
        console.log(`   ${chalk.gray('•')} ${lib.name} ${chalk.dim(`(${lib.version})`)}`);
    }

    if (libraries.length > maxItems) {
        console.log(chalk.dim(`   ... and ${libraries.length - maxItems} more`));
    }
}
