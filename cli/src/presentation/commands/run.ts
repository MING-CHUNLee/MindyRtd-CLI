/**
 * Command: run
 *
 * Execute R code in the RStudio session.
 *
 * Usage:
 *   mindy run                             # Run current file in RStudio
 *   mindy run "1 + 1"                     # Execute inline code
 *   mindy run script.R                    # Execute R file
 *   mindy run report.Rmd                  # Render Rmd file
 *   mindy run --yes                       # Skip confirmation
 *   mindy run --timeout 60000             # Custom timeout
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { RBridge } from '../../core/services/r-bridge';
import { confirmCode } from '../../core/services/code-confirmer';
import { RunCommandOptions, ExecutionResponse } from '../../shared/types/execution';
import { EXECUTION } from '../../infrastructure/config/constants';
import { handleError } from '../../shared/utils/error-handler';
import {
    CodeFileNotFoundError,
    ExecutionRejectedError,
    PlumberConnectionError,
} from '../../shared/utils/errors';

// ============================================
// Types
// ============================================

type ExecutionMode = 'current' | 'code' | 'file' | 'rmd';

interface ParsedInput {
    mode: ExecutionMode;
    code?: string;
    filePath?: string;
}

// ============================================
// Command Definition
// ============================================

export const runCommand = new Command('run')
    .description('Execute R code in RStudio session (runs current file by default)')
    .argument('[code]', 'R code string or path to .R file (optional, defaults to current file)')
    .option('-y, --yes', 'Skip confirmation prompt', false)
    .option('-t, --timeout <ms>', 'Execution timeout in milliseconds', String(EXECUTION.DEFAULT_TIMEOUT_MS))
    .option('-j, --json', 'Output result as JSON', false)
    .action(async (codeArg: string | undefined, options) => {
        const parsedOptions: RunCommandOptions = {
            yes: options.yes,
            port: EXECUTION.DEFAULT_PORT,
            timeout: parseInt(options.timeout, 10),
            json: options.json,
        };
        await executeRunCommand(codeArg, parsedOptions);
    });

// ============================================
// Command Execution
// ============================================

async function executeRunCommand(
    codeArg: string | undefined,
    options: RunCommandOptions
): Promise<void> {
    try {
        // Parse input to determine execution mode
        const input = parseInput(codeArg);

        // Check if listener is running
        const bridge = new RBridge(options.timeout);

        if (!bridge.isListenerRunning()) {
            console.log('');
            console.log(chalk.red('Mindy listener is not running in RStudio.'));
            console.log('');
            console.log(chalk.yellow('To start the listener, run this in RStudio Console:'));
            console.log(chalk.cyan('  mindy::start()'));
            console.log('');
            throw new PlumberConnectionError('localhost', 0);
        }

        // Show what we're about to execute
        if (!options.json) {
            displayExecutionInfo(input);
        }

        // Confirm execution (unless --yes flag or running current file)
        if (!options.yes && input.mode !== 'current') {
            const codeToShow = input.code ?? '';
            const confirmation = await confirmCode(codeToShow, {
                title: input.mode === 'file'
                    ? `R File: ${input.filePath}`
                    : 'R Code to Execute',
            });

            if (!confirmation.approved) {
                throw new ExecutionRejectedError();
            }
        }

        // Execute
        const spinner = ora({
            text: getSpinnerText(input),
            color: 'cyan',
        }).start();

        let result: ExecutionResponse;

        switch (input.mode) {
            case 'current':
                result = await bridge.runCurrentFile();
                break;
            case 'file':
                result = await bridge.runFile(input.filePath!);
                break;
            case 'rmd':
                result = await bridge.renderRmd(input.filePath!);
                break;
            case 'code':
                result = await bridge.runCode(input.code!);
                break;
        }

        // Handle result
        if (result.status === 'completed') {
            spinner.succeed(chalk.green('Execution completed!'));
            displayResult(result, options);
        } else if (result.status === 'error') {
            spinner.fail(chalk.red('Execution failed'));
            displayError(result, options);
        } else {
            spinner.warn(chalk.yellow(`Execution ended with status: ${result.status}`));
            displayResult(result, options);
        }
    } catch (error) {
        handleError(error, 'R code execution');
    }
}

// ============================================
// Input Parsing
// ============================================

function parseInput(codeArg: string | undefined): ParsedInput {
    // No argument = run current file in RStudio
    if (!codeArg) {
        return { mode: 'current' };
    }

    // Check if it's an Rmd file
    if (/\.[Rr]md$/.test(codeArg)) {
        const filePath = path.resolve(codeArg);

        if (!fs.existsSync(filePath)) {
            throw new CodeFileNotFoundError(filePath);
        }

        const code = fs.readFileSync(filePath, 'utf-8');
        return {
            mode: 'rmd',
            code,
            filePath,
        };
    }

    // Check if it's an R file
    if (/\.[Rr]$/.test(codeArg)) {
        const filePath = path.resolve(codeArg);

        if (!fs.existsSync(filePath)) {
            throw new CodeFileNotFoundError(filePath);
        }

        const code = fs.readFileSync(filePath, 'utf-8');
        return {
            mode: 'file',
            code,
            filePath,
        };
    }

    // Treat as inline code
    return {
        mode: 'code',
        code: codeArg,
    };
}

// ============================================
// Display Functions
// ============================================

function getSpinnerText(input: ParsedInput): string {
    switch (input.mode) {
        case 'current':
            return 'Running current file in RStudio...';
        case 'file':
            return `Running ${path.basename(input.filePath!)}...`;
        case 'rmd':
            return `Rendering ${path.basename(input.filePath!)}...`;
        case 'code':
            return 'Executing R code...';
    }
}

function displayExecutionInfo(input: ParsedInput): void {
    console.log('');
    switch (input.mode) {
        case 'current':
            console.log(chalk.cyan('Running the current file open in RStudio editor'));
            break;
        case 'file':
            console.log(chalk.gray(`File: ${input.filePath}`));
            console.log(chalk.gray(`Size: ${input.code!.length} characters, ${input.code!.split('\n').length} lines`));
            break;
        case 'rmd':
            console.log(chalk.magenta(`Rendering Rmd: ${input.filePath}`));
            console.log(chalk.gray(`Size: ${input.code!.length} characters`));
            break;
        case 'code':
            console.log(chalk.gray(`Code: ${input.code!.length} characters`));
            break;
    }
}

function displayResult(result: ExecutionResponse, options: RunCommandOptions): void {
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log('');
    console.log(chalk.bold.cyan('─── Output ───────────────────────────────────'));
    console.log('');

    if (result.output) {
        console.log(result.output);
    } else {
        console.log(chalk.gray('(code sent to RStudio console)'));
    }

    console.log('');
    console.log(chalk.gray('───────────────────────────────────────────────'));

    if (result.duration) {
        console.log(chalk.gray(`Duration: ${result.duration}ms`));
    }

    // Show file path if available
    const resultWithFile = result as ExecutionResponse & { file?: string };
    if (resultWithFile.file) {
        console.log(chalk.gray(`File: ${resultWithFile.file}`));
    }
}

function displayError(result: ExecutionResponse, options: RunCommandOptions): void {
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log('');
    console.log(chalk.bold.red('─── Error ────────────────────────────────────'));
    console.log('');

    if (result.error) {
        console.log(chalk.red(result.error));
    } else {
        console.log(chalk.red('Unknown error occurred'));
    }

    console.log('');
    console.log(chalk.gray('───────────────────────────────────────────────'));
}
