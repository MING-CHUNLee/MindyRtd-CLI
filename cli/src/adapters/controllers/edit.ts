/**
 * Command: edit
 *
 * Sends one or more R files to the Ruby API for LLM-based editing,
 * shows a colored diff, and asks the user to apply or discard.
 *
 * Two dispatch modes:
 *
 *   EXPLICIT  — user names the file:
 *     mindy-cli edit script.R "Add error handling to all functions"
 *
 *   SMART     — user omits the file; FileResolver asks the LLM
 *               which file(s) in the workspace are relevant:
 *     mindy-cli edit "Add error handling to the data loading functions"
 *
 * Flow:
 *   [smart only] Phase 1: FileResolver → Ruby API → LLM picks target files
 *   Phase 2:              RubyApiClient → Ruby API → LLM edits each file
 *   Phase 3:              DiffEngine shows diff → user confirms → write
 */

import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { resolve, basename } from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { DiffEngine } from '../../application/services/diff-engine';
import { FileResolver } from '../../application/services/file-resolver';
import { RubyApiClient } from '../../infrastructure/api/ruby-api-client';
import { handleError } from '../../shared/utils/error-handler';

// ============================================
// Command Definition
// ============================================

export const editCommand = new Command('edit')
    .description('Edit R file(s) using LLM suggestions via the Ruby API')
    .argument('[file]', 'Path to the R file to edit (omit to auto-detect from instruction)')
    .argument('<instruction>', 'Natural language instruction for the LLM')
    .option('-y, --yes', 'Apply all changes automatically without confirmation', false)
    .addHelpText('after', `
Examples:
  # Explicit — edit a known file
  $ mindy-cli edit script.R "Add error handling to all functions"

  # Smart — let the LLM pick the right file(s)
  $ mindy-cli edit "Add error handling to the data loading functions"
    `)
    .action(async (fileArg: string | undefined, instruction: string, options: { yes: boolean }) => {
        await executeEditCommand(fileArg, instruction, options.yes);
    });

// ============================================
// Command Execution
// ============================================

async function executeEditCommand(
    fileArg: string | undefined,
    instruction: string,
    skipConfirm: boolean
): Promise<void> {
    try {
        const client = new RubyApiClient();
        const engine = new DiffEngine();

        // -----------------------------------------------
        // Determine which file(s) to edit
        // -----------------------------------------------
        let targets: Array<{ absolutePath: string; displayName: string }>;

        if (fileArg) {
            // Explicit mode — user provided the file
            const absolutePath = resolve(fileArg);
            targets = [{ absolutePath, displayName: fileArg }];
        } else {
            // Smart mode — ask the LLM which files are relevant
            const spinner = ora('Scanning workspace and resolving relevant files...').start();
            const resolver = new FileResolver(client);

            const resolved = await resolver.resolve(instruction);

            if (resolved.length === 0) {
                spinner.warn(chalk.yellow('No relevant R files found for this instruction.'));
                return;
            }

            spinner.succeed(
                chalk.green(`Resolved ${resolved.length} file(s): `) +
                resolved.map((f) => chalk.cyan(f.relativePath)).join(', ')
            );

            targets = resolved.map((f) => ({
                absolutePath: f.absolutePath,
                displayName: f.relativePath,
            }));
        }

        // -----------------------------------------------
        // Edit each target file
        // -----------------------------------------------
        for (const target of targets) {
            await editOneFile(client, engine, target, instruction, skipConfirm);
        }
    } catch (error) {
        handleError(error, 'edit');
    }
}

async function editOneFile(
    client: RubyApiClient,
    engine: DiffEngine,
    target: { absolutePath: string; displayName: string },
    instruction: string,
    skipConfirm: boolean
): Promise<void> {
    const { absolutePath, displayName } = target;
    const fileName = basename(displayName);

    // 1. Read original content
    const originalContent = await readFile(absolutePath, 'utf-8');

    // 2. Call Ruby API → LLM edits the file
    const spinner = ora(`[${fileName}] Sending to LLM via Ruby API...`).start();
    let modifiedContent: string;

    try {
        const result = await client.editFile({
            filePath: displayName,
            content: originalContent,
            instruction,
        });
        modifiedContent = result.modifiedContent;
        spinner.succeed(chalk.green(`[${fileName}] LLM edit received`));
    } catch (error) {
        spinner.fail(chalk.red(`[${fileName}] LLM edit failed`));
        throw error;
    }

    // 3. Show colored diff
    console.log('');
    console.log(chalk.bold.gray(`--- ${displayName}  (original)`));
    console.log(chalk.bold.gray(`+++ ${displayName}  (modified)`));
    console.log('');
    console.log(engine.generateColoredDiff(originalContent, modifiedContent));

    // 4. Confirm and apply
    if (skipConfirm) {
        await writeFile(absolutePath, modifiedContent, 'utf-8');
        console.log(chalk.green(`✓ Changes applied to ${displayName}\n`));
        return;
    }

    const apply = await promptConfirm(`Apply changes to ${displayName}? [y/N]: `, false);
    if (apply) {
        await writeFile(absolutePath, modifiedContent, 'utf-8');
        console.log(chalk.green(`✓ Changes applied to ${displayName}\n`));
    } else {
        console.log(chalk.gray(`Changes to ${displayName} discarded.\n`));
    }
}

// ============================================
// Helpers
// ============================================

function promptConfirm(question: string, defaultAnswer: boolean): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(chalk.yellow(question), (answer) => {
            rl.close();
            const normalized = answer.trim().toLowerCase();
            if (normalized === '') return resolve(defaultAnswer);
            resolve(['y', 'yes'].includes(normalized));
        });
    });
}
