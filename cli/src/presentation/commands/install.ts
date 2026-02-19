/**
 * Command: install
 *
 * Install R packages in RStudio session.
 *
 * Usage:
 *   mindy install dplyr                       # Install single package
 *   mindy install dplyr ggplot2               # Install multiple packages
 *   mindy install dplyr --yes                 # Skip confirmation
 *   mindy install dplyr --repos <url>         # Custom CRAN mirror
 *   mindy install tidyverse/dplyr --source github  # Install from GitHub
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { RBridge } from '../../core/services/r-bridge';
import { PackageInstaller } from '../../core/services/package-installer';
import { PackageValidator } from '../../core/services/package-validator';
import {
    InstallCommandOptions,
    InstallationResponse,
    PackageInfo,
} from '../../shared/types/installation';
import {
    PackageSafetyReport,
    SafetyLevel,
} from '../../shared/types/package-safety';
import {
    INSTALLATION,
    SAFETY,
} from '../../infrastructure/config/constants';
import { handleError } from '../../shared/utils/error-handler';
import { PlumberConnectionError } from '../../shared/utils/errors';

// ============================================
// Types
// ============================================

interface InstallServices {
    installer: PackageInstaller;
    validator: PackageValidator;
}

// ============================================
// Command Definition
// ============================================

export const installCommand = new Command('install')
    .description('Install R packages in RStudio session')
    .argument('<packages...>', 'Package names to install')
    .option('-y, --yes', 'Skip confirmation prompt', false)
    .option(
        '-r, --repos <url>',
        'CRAN repository URL',
        INSTALLATION.DEFAULT_REPOS
    )
    .option(
        '-s, --source <type>',
        'Installation source (cran|github|bioconductor)',
        'cran'
    )
    .option('--no-dependencies', 'Do not install dependencies')
    .option(
        '-t, --timeout <ms>',
        'Installation timeout in milliseconds',
        String(INSTALLATION.DEFAULT_TIMEOUT_MS)
    )
    .option('-j, --json', 'Output result as JSON', false)
    .option('--skip-safety', 'Skip safety checks (not recommended)', false)
    .action(async (packages: string[], options) => {
        const parsedOptions: InstallCommandOptions = {
            yes: options.yes,
            repos: options.repos,
            source: options.source,
            dependencies: options.dependencies !== false,
            timeout: parseInt(options.timeout, 10),
            json: options.json,
            skipSafety: options.skipSafety,
        };
        await executeInstallCommand(packages, parsedOptions);
    });

// ============================================
// Command Execution (Orchestrator)
// ============================================

async function executeInstallCommand(
    packages: string[],
    options: InstallCommandOptions
): Promise<void> {
    try {
        const services = createServices(options);
        ensureListenerRunning(services.installer);

        if (!options.json) {
            displayInstallationInfo(packages, options);
        }

        await runSafetyChecksPhase(packages, options, services.validator);
        const toInstall = await checkAndFilterPackages(packages, services.installer, options);

        if (toInstall.length === 0) {
            console.log('');
            console.log(chalk.green('All packages are already installed!'));
            return;
        }

        await confirmAndInstall(toInstall, services.installer, options);
    } catch (error) {
        handleError(error, 'package installation');
    }
}

// ============================================
// Phase Functions
// ============================================

/**
 * Create service instances with injected dependencies.
 */
function createServices(options: InstallCommandOptions): InstallServices {
    const bridge = new RBridge(options.timeout);
    return {
        installer: new PackageInstaller(bridge),
        validator: new PackageValidator(),
    };
}

/**
 * Verify that the Mindy listener is running in RStudio.
 * Throws PlumberConnectionError if not running.
 */
function ensureListenerRunning(installer: PackageInstaller): void {
    if (!installer.isListenerRunning()) {
        console.log('');
        console.log(chalk.red('Mindy listener is not running in RStudio.'));
        console.log('');
        console.log(chalk.yellow('To start the listener, run this in RStudio Console:'));
        console.log(chalk.cyan('  mindy::start()'));
        console.log('');
        throw new PlumberConnectionError('localhost', 0);
    }
}

/**
 * Run safety checks and block/warn as needed.
 * Returns early (no-op) if safety checks are disabled.
 */
async function runSafetyChecksPhase(
    packages: string[],
    options: InstallCommandOptions,
    validator: PackageValidator
): Promise<void> {
    if (!SAFETY.ENABLE_SAFETY_CHECKS || options.skipSafety) return;

    const safetyReports = await performSafetyChecks(packages, options, validator);

    // Block if any package is unsafe
    const blocked = safetyReports.filter((report) => !report.allowInstallation);
    if (blocked.length > 0) {
        console.log('');
        console.log(chalk.red('❌ Installation blocked for the following packages:'));
        blocked.forEach((report) => {
            console.log(chalk.red(`  • ${report.packageName}: ${report.errors.join(', ')}`));
        });
        throw new Error('Installation blocked by safety checks');
    }

    // Warn about risky packages
    const risky = safetyReports.filter(
        (report) => report.safetyLevel === 'risky' || report.safetyLevel === 'dangerous'
    );

    if (risky.length > 0 && !options.yes) {
        console.log('');
        console.log(chalk.yellow('⚠️  Warning: Some packages have safety concerns'));

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Do you still want to proceed?',
                default: false,
            },
        ]);

        if (!confirm) {
            console.log(chalk.yellow('Installation cancelled.'));
            throw new Error('Installation cancelled by user');
        }
    }
}

/**
 * Check which packages are already installed, display status, and return only those needing install.
 */
async function checkAndFilterPackages(
    packages: string[],
    installer: PackageInstaller,
    options: InstallCommandOptions
): Promise<PackageInfo[]> {
    const checkSpinner = ora('Checking package status...').start();
    const packageInfo = await installer.checkPackages(packages);
    checkSpinner.succeed();

    const alreadyInstalledPackages = packageInfo.filter((pkg) => pkg.installed);
    const packagesToInstall = packageInfo.filter((pkg) => !pkg.installed);

    if (alreadyInstalledPackages.length > 0 && !options.json) {
        console.log('');
        console.log(chalk.yellow('Already installed:'));
        alreadyInstalledPackages.forEach((pkg) => {
            console.log(chalk.gray(`  ✓ ${pkg.name} (${pkg.version})`));
        });
    }

    return packagesToInstall;
}

/**
 * Prompt for confirmation (if needed) and perform the installation.
 */
async function confirmAndInstall(
    toInstall: PackageInfo[],
    installer: PackageInstaller,
    options: InstallCommandOptions
): Promise<void> {
    // Confirm installation
    if (!options.yes) {
        console.log('');
        console.log(chalk.cyan('Packages to install:'));
        toInstall.forEach((pkg) => console.log(chalk.white(`  • ${pkg.name}`)));
        console.log('');

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Proceed with installation?',
                default: true,
            },
        ]);

        if (!confirm) {
            console.log(chalk.yellow('Installation cancelled.'));
            return;
        }
    }

    // Install packages
    const installSpinner = ora({
        text: `Installing ${toInstall.length} package(s)...`,
        color: 'cyan',
    }).start();

    const result = await installer.install({
        packages: toInstall.map((pkg) => pkg.name),
        repos: options.repos,
        dependencies: options.dependencies,
        source: options.source,
        timeout: options.timeout,
    });

    // Handle result
    if (result.status === 'completed') {
        installSpinner.succeed(chalk.green('Installation completed!'));
        displayResult(result, options);
    } else if (result.status === 'partial') {
        installSpinner.warn(chalk.yellow('Installation partially completed'));
        displayResult(result, options);
    } else {
        installSpinner.fail(chalk.red('Installation failed'));
        displayError(result, options);
    }
}

// ============================================
// Safety Checks
// ============================================

async function performSafetyChecks(
    packages: string[],
    options: InstallCommandOptions,
    validator: PackageValidator
): Promise<PackageSafetyReport[]> {
    if (options.json) {
        return Promise.all(
            packages.map((pkg) => validator.validate(pkg, options.source))
        );
    }

    console.log('');
    const safetySpinner = ora('Performing safety checks...').start();

    const safetyReports = await Promise.all(
        packages.map((pkg) => validator.validate(pkg, options.source))
    );

    safetySpinner.succeed();
    displaySafetyReports(safetyReports, options);

    return safetyReports;
}

// ============================================
// Display Functions
// ============================================

function displayInstallationInfo(
    packages: string[],
    options: InstallCommandOptions
): void {
    console.log('');
    console.log(chalk.bold.cyan('Package Installation'));
    console.log(chalk.gray(`Source: ${options.source}`));
    if (options.repos) {
        console.log(chalk.gray(`Repository: ${options.repos}`));
    }
    console.log(
        chalk.gray(`Dependencies: ${options.dependencies ? 'Yes' : 'No'}`)
    );
    console.log('');
}

function displaySafetyReports(
    reports: PackageSafetyReport[],
    options: InstallCommandOptions
): void {
    if (options.json) return;

    console.log('');
    console.log(chalk.bold.cyan('Safety Check Results:'));
    console.log('');

    reports.forEach((report) => {
        const icon = getSafetyIcon(report.safetyLevel);
        const color = getSafetyColor(report.safetyLevel);

        console.log(
            chalk[color](
                `${icon} ${report.packageName} - ${report.safetyLevel.toUpperCase()}`
            )
        );

        if (report.warnings.length > 0) {
            report.warnings.forEach((warning) => {
                console.log(chalk.yellow(`    ⚠️  ${warning}`));
            });
        }

        if (report.errors.length > 0) {
            report.errors.forEach((err) => {
                console.log(chalk.red(`    ❌ ${err}`));
            });
        }
    });
}

function displayResult(
    result: InstallationResponse,
    options: InstallCommandOptions
): void {
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log('');

    if (result.installed && result.installed.length > 0) {
        console.log(chalk.green('✓ Successfully installed:'));
        result.installed.forEach((pkg) => {
            console.log(chalk.white(`  • ${pkg}`));
        });
    }

    if (result.failed && result.failed.length > 0) {
        console.log('');
        console.log(chalk.red('✗ Failed to install:'));
        result.failed.forEach((pkg) => {
            console.log(chalk.white(`  • ${pkg}`));
        });
    }

    if (result.output && result.output.trim()) {
        console.log('');
        console.log(chalk.gray('Installation output:'));
        console.log(chalk.gray(result.output));
    }

    if (result.duration) {
        console.log('');
        console.log(
            chalk.gray(`Duration: ${(result.duration / 1000).toFixed(1)}s`)
        );
    }
}

function displayError(
    result: InstallationResponse,
    options: InstallCommandOptions
): void {
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log('');
    console.log(
        chalk.bold.red('─── Error ────────────────────────────────────')
    );
    console.log('');

    if (result.error) {
        console.log(chalk.red(result.error));
    } else {
        console.log(chalk.red('Unknown error occurred'));
    }

    if (result.output && result.output.trim()) {
        console.log('');
        console.log(chalk.gray('Output:'));
        console.log(chalk.gray(result.output));
    }

    console.log('');
    console.log(
        chalk.gray('───────────────────────────────────────────────')
    );
}

// ============================================
// Helper Functions
// ============================================

function getSafetyIcon(level: SafetyLevel): string {
    switch (level) {
        case 'safe':
            return '✅';
        case 'warning':
            return '⚠️';
        case 'risky':
            return '⚠️';
        case 'dangerous':
            return '❌';
        case 'blocked':
            return '🚫';
    }
}

function getSafetyColor(level: SafetyLevel): 'green' | 'yellow' | 'red' {
    switch (level) {
        case 'safe':
            return 'green';
        case 'warning':
        case 'risky':
            return 'yellow';
        case 'dangerous':
        case 'blocked':
            return 'red';
    }
}
