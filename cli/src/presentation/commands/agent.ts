/**
 * Command: agent
 *
 * Runs the Agent CLI workflow:
 * 1. Scans workspace (Phase 0)
 * 2. Filters relevant files (Phase 1)
 * 3. Generates edits (Phase 2)
 * 4. Shows diffs and asks for confirmation (Phase 3)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { FileResolver } from '../../core/services/file-resolver';
import { handleError } from '../../shared/utils/error-handler';
import * as diff from 'diff';
import readline from 'readline';

interface AgentCommandOptions {
    directory: string;
}

export const agentCommand = new Command('agent')
    .description('Run Agent to edit files based on natural language instruction')
    .argument('<instruction>', 'Instruction for the agent (e.g., "Add error handling to the scanner")')
    .option('-d, --directory <path>', 'Workspace directory to scan', '.')
    .action(async (instruction: string, options: AgentCommandOptions) => {
        await executeAgentCommand(instruction, options);
    });

async function executeAgentCommand(instruction: string, options: AgentCommandOptions): Promise<void> {
    console.log(chalk.blue(`🤖 Mindy Agent started. Instruction: "${instruction}"\n`));

    // Phase 0: Scan Workspace
    // Note: We use a custom glob here instead of the R-specific file-scanner to allow 
    // the agent to also edit TS/JS files if needed (e.g., self-hosting editing).
    const scanSpinner = ora('Scanning workspace for files...').start();
    let candidates: { path: string, name: string }[] = [];
    try {
        const files = await glob('**/*.{ts,js,R,Rmd,xml,json,md,py}', {
            cwd: path.resolve(options.directory),
            absolute: true,
            ignore: ['**/node_modules/**', '**/dist/**', '**/.*/**']
        });

        candidates = files.map(f => ({ path: f, name: path.basename(f) }));
        scanSpinner.succeed(`Scanned ${candidates.length} candidate files in the workspace.`);
    } catch (e) {
        scanSpinner.fail('Workspace scan failed.');
        handleError(e, 'agent file scan');
        return;
    }

    const resolver = new FileResolver();

    // Phase 1: Resolve
    const phase1Spinner = ora('Phase 1: Agent is resolving relevant files...').start();
    let targets: string[] = [];
    try {
        // We pretend these are FileInfos. The resolver only needs `.path`. 
        targets = await resolver.resolveRelevantFiles(instruction, candidates as any, 15);

        if (targets.length > 0) {
            phase1Spinner.succeed(`Phase 1 Complete. LLM identified ${targets.length} files to modify.`);
            targets.forEach(t => console.log(chalk.dim(`  - ${t}`)));
        } else {
            phase1Spinner.info('No relevant files found by the logic. Exiting.');
            return;
        }
    } catch (e) {
        phase1Spinner.fail('Phase 1 failed.');
        handleError(e, 'phase 1 resolve');
        return;
    }

    // Phase 2: Edit
    const phase2Spinner = ora('Phase 2: Generating code modifications...').start();
    let editedFiles: { path: string, content: string }[] = [];
    try {
        editedFiles = await resolver.generateEdits(instruction, targets);
        phase2Spinner.succeed(`Phase 2 Complete. Received format edits for ${editedFiles.length} files.`);
    } catch (e) {
        phase2Spinner.fail('Phase 2 failed.');
        handleError(e, 'phase 2 edit');
        return;
    }

    // Phase 3: Review & Write
    for (const edit of editedFiles) {
        // Resolve absolute path in case LLM gave relative
        const absolutePath = path.resolve(options.directory, edit.path);

        console.log(chalk.bold(`\n📝 Reviewing changes for: ${edit.path}`));

        let originalContent = '';
        try {
            originalContent = fs.readFileSync(absolutePath, 'utf8');
        } catch (e) {
            console.log(chalk.yellow(`(File will be created as a new file)`));
        }

        // Show colored diff
        const patch = diff.createTwoFilesPatch('Original', 'Modified', originalContent, edit.content);
        let hasChanges = false;

        patch.split('\n').forEach(line => {
            // Only care about actual additive/subtractive lines for checking if changed
            if (!line.startsWith('---') && !line.startsWith('+++')) {
                if (line.startsWith('+')) {
                    console.log(chalk.green(line));
                    hasChanges = true;
                } else if (line.startsWith('-')) {
                    console.log(chalk.red(line));
                    hasChanges = true;
                } else {
                    console.log(chalk.dim(line));
                }
            }
        });

        if (!hasChanges) {
            console.log(chalk.gray('  No significant changes detected. Skipping.\n'));
            continue;
        }

        const approved = await promptConfirm('Accept these changes? [Y/n] ');
        if (approved) {
            // Ensure dir exists
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, edit.content, 'utf8');
            console.log(chalk.green(`✓ Changes applied to ${edit.path}.\n`));
        } else {
            console.log(chalk.yellow(`✗ Changes to ${edit.path} rejected.\n`));
        }
    }

    console.log(chalk.blue('✅ Agent workflow complete.'));
}

async function promptConfirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(chalk.yellow(question), answer => {
            rl.close();
            const normalized = answer.trim().toLowerCase();
            resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
        });
    });
}
