/**
 * Controller: agent (one-shot CLI command)
 *
 * Thin wrapper around AgentService for backward-compatible
 * `mindy-cli agent "instruction"` one-shot usage.
 *
 * All business logic lives in AgentService.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import readline from 'readline';

import { AgentService, AgentEvent, ProposedEdit } from '../services/agent-service';
import { ContextStatusBar } from '../../presentation/views/context-status-bar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentOptions {
    directory: string;
    resume: boolean;
    session?: string;
    new: boolean;
}

// ── Command Definition ────────────────────────────────────────────────────────

export const agentCommand = new Command('agent')
    .description('Run Agent to edit files based on natural language instruction')
    .argument('<instruction>', 'What the agent should do')
    .option('-d, --directory <path>', 'Workspace directory to scan', '.')
    .option('--resume', 'Resume the last saved session', false)
    .option('--session <id>', 'Resume a specific session by ID')
    .option('--new', 'Force a new session (ignore last)', false)
    .addHelpText('after', `
Examples:
  # New session
  $ mindy-cli agent "Add error handling to the scanner"

  # Resume last session (agent remembers previous changes)
  $ mindy-cli agent "Now add tests for those changes" --resume

  # Resume a specific session
  $ mindy-cli agent "Continue the refactor" --session abc123
    `)
    .action(async (instruction: string, options: AgentOptions) => {
        await executeAgentCommand(instruction, options);
    });

// ── Main Execution ────────────────────────────────────────────────────────────

async function executeAgentCommand(
    instruction: string,
    options: AgentOptions,
): Promise<void> {
    const statusBar = new ContextStatusBar();
    let spinner: Ora | null = null;

    // Console-based event handler
    const onEvent = (event: AgentEvent): void => {
        switch (event.type) {
            case 'session_loaded': {
                const { sessionId, turnCount } = event.data as { sessionId: string; turnCount: number };
                if (turnCount > 0) {
                    console.log(chalk.cyan(`\n↩  Resuming session ${(sessionId as string).slice(-6)} (${turnCount} previous turns)`));
                } else {
                    console.log(chalk.dim(`\n  New session ${(sessionId as string).slice(-6)}`));
                }
                break;
            }
            case 'intent_classified':
                spinner?.succeed(`Intent classified as: ${chalk.cyan(event.data.intent)}`);
                spinner = null;
                if (event.data.intent === 'edit') {
                    console.log(chalk.blue(`\n🤖 Instruction: "${instruction}"\n`));
                }
                break;
            case 'phase_start':
                spinner = ora(event.data.description as string).start();
                break;
            case 'phase_end':
                if (event.data.success) {
                    spinner?.succeed(event.data.summary as string ?? (event.data.phase as string) + ' done');
                } else {
                    spinner?.fail((event.data.phase as string) + ' failed');
                }
                spinner = null;
                break;
            case 'react_step': {
                const { thought, action, observation } = event.data;
                if (thought) console.log(chalk.dim(`  [Step] ${(thought as string).slice(0, 120)}`));
                if (action) console.log(chalk.cyan(`    → Tool: ${(action as { tool: string }).tool}`));
                if (observation) console.log(chalk.gray(`    ← ${(observation as string).slice(0, 100)}`));
                break;
            }
            case 'text_output':
                console.log('\n======================================================');
                console.log(chalk.green(event.data.content as string));
                console.log('======================================================\n');
                break;
            case 'stream_token':
                process.stdout.write(chalk.green(event.data.token as string));
                break;
            case 'diff_proposed':
                console.log(chalk.bold(`\n📄 ${event.data.path}`));
                console.log(chalk.dim('─'.repeat(56)));
                console.log(event.data.diff as string);
                console.log(chalk.dim('─'.repeat(56)));
                break;
            case 'edit_applied':
                console.log(chalk.green(`✓ Written: ${event.data.path}`));
                break;
            case 'edit_rejected':
                console.log(chalk.yellow(`✗ Rejected: ${event.data.path} — disk untouched`));
                break;
            case 'turn_saved':
                console.log(chalk.blue('\n✅ Agent workflow complete.'));
                break;
            case 'status_update':
                if (event.data.plugins) {
                    console.log(chalk.dim(`  Plugins: ${(event.data.plugins as string[]).join(', ')}`));
                }
                if (event.data.knowledge) {
                    console.log(chalk.dim(`  Knowledge: ${(event.data.knowledge as string[]).join(', ')}`));
                }
                break;
            case 'error':
                console.error(chalk.red(`Error [${event.data.phase}]: ${event.data.message}`));
                break;
        }
    };

    // Console-based approval callback
    const onApproval = async (edit: ProposedEdit): Promise<boolean> => {
        return promptConfirm(`Apply changes to ${chalk.cyan(edit.path)}? [Y/n] `);
    };

    const service = new AgentService(
        { directory: options.directory },
        onEvent,
        onApproval,
    );

    await service.initialize({
        sessionId: options.session,
        forceNew: options.new,
    });

    await service.executeInstruction(instruction);

    // Render final status bar
    statusBar.render(service.getSession());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function promptConfirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(chalk.yellow(question), answer => {
            rl.close();
            const n = answer.trim().toLowerCase();
            resolve(n === '' || n === 'y' || n === 'yes');
        });
    });
}
