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
// Command Execution
// ============================================

async function executeInstallCommand(
    packages: string[],
    options: InstallCommandOptions
): Promise<void> {
    try {
        const installer = new PackageInstaller(options.timeout);
        const validator = new PackageValidator();

        // Check if listener is running
        if (!installer.isListenerRunning()) {
            console.log('');
            console.log(
                chalk.red('Mindy listener is not running in RStudio.')
            );
            console.log('');
            console.log(
                chalk.yellow('To start the listener, run this in RStudio Console:')
            );
            console.log(chalk.cyan('  mindy::start()'));
            console.log('');
            throw new PlumberConnectionError('localhost', 0);
        }

        // Display installation info
        if (!options.json) {
            displayInstallationInfo(packages, options);
        }

        // Safety checks
        if (SAFETY.ENABLE_SAFETY_CHECKS && !options.skipSafety) {
            const safetyReports = await performSafetyChecks(
                packages,
                options,
                validator
            );

            // Check if any package is blocked
            const blocked = safetyReports.filter((r) => !r.allowInstallation);
            if (blocked.length > 0) {
                console.log('');
                console.log(
                    chalk.red(
                        '❌ Installation blocked for the following packages:'
                    )
                );
                blocked.forEach((r) => {
                    console.log(
                        chalk.red(`  • ${r.packageName}: ${r.errors.join(', ')}`)
                    );
                });
                return;
            }

            // Warn about risky packages
            const risky = safetyReports.filter(
                (r) =>
                    r.safetyLevel === 'risky' || r.safetyLevel === 'dangerous'
            );

            if (risky.length > 0 && !options.yes) {
                console.log('');
                console.log(
                    chalk.yellow(
                        '⚠️  Warning: Some packages have safety concerns'
                    )
                );

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
                    return;
                }
            }
        }

        // Check which packages are already installed
        const checkSpinner = ora('Checking package status...').start();
        const packageInfo = await installer.checkPackages(packages);
        checkSpinner.succeed();

        const toInstall = packageInfo.filter((p) => !p.installed);
        const alreadyInstalled = packageInfo.filter((p) => p.installed);

        if (alreadyInstalled.length > 0 && !options.json) {
            console.log('');
            console.log(chalk.yellow('Already installed:'));
            alreadyInstalled.forEach((p) => {
                console.log(chalk.gray(`  ✓ ${p.name} (${p.version})`));
            });
        }

        if (toInstall.length === 0) {
            console.log('');
            console.log(chalk.green('All packages are already installed!'));
            return;
        }

        // Confirm installation
        if (!options.yes) {
            console.log('');
            console.log(chalk.cyan('Packages to install:'));
            toInstall.forEach((p) => console.log(chalk.white(`  • ${p.name}`)));
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
            packages: toInstall.map((p) => p.name),
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
            installSpinner.warn(
                chalk.yellow('Installation partially completed')
            );
            displayResult(result, options);
        } else {
            installSpinner.fail(chalk.red('Installation failed'));
            displayError(result, options);
        }
    } catch (error) {
        handleError(error, 'package installation');
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
        // Silent mode for JSON output
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

    // Display safety reports
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
            report.warnings.forEach((w) => {
                console.log(chalk.yellow(`    ⚠️  ${w}`));
            });
        }

        if (report.errors.length > 0) {
            report.errors.forEach((e) => {
                console.log(chalk.red(`    ❌ ${e}`));
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
