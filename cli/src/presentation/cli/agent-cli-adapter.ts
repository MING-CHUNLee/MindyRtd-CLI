/**
 * Presentation: AgentCliAdapter (CLI adapter for one-shot agent command)
 *
 * Thin presentation layer that wires chalk/ora/readline event handlers
 * to AgentController for the `mindy-cli agent "instruction"` one-shot usage.
 *
 * Responsibilities:
 * - Build onEvent handler (chalk, ora, console.log)
 * - Build onApproval handler (readline)
 * - Instantiate AgentController
 * - Call displayStatusBar after completion
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import readline from 'readline';

import { AgentController, AgentEvent, ProposedEdit, ProposedInstall } from '../../application/controllers/agent-controller';
import { displayStatusBar } from '../views/context-status-bar';
import { rollbackCommand } from './rollback-cli-adapter';
import { StatusBarItemKey } from '../view-models';

export interface AgentCliAdapterDeps {
    /**
     * Composition root: build a fully wired controller (including injected deps).
     * This keeps infrastructure imports out of the presentation layer.
     */
    createController: (args: {
        directory: string;
        viewAdapter: (event: AgentEvent) => void;
        approvalGate: (edit: ProposedEdit) => Promise<boolean>;
        installApprovalGate: (plan: ProposedInstall) => Promise<boolean>;
    }) => AgentController;

    /** Status bar item order (typically loaded from user settings). */
    statusBarItems: StatusBarItemKey[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentOptions {
    directory: string;
    resume: boolean;
    session?: string;
    new: boolean;
}

// ── Command Definition ────────────────────────────────────────────────────────

export function createAgentCommand(deps: AgentCliAdapterDeps): Command {
    return new Command('agent')
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
            await executeAgentCommand(deps, instruction, options);
        })
        .addCommand(rollbackCommand);
}

// ── Main Execution ────────────────────────────────────────────────────────────

async function executeAgentCommand(
    deps: AgentCliAdapterDeps,
    instruction: string,
    options: AgentOptions,
): Promise<void> {
    let spinner: Ora | null = null;
    // Forward reference so the event handler can access mode after controller is created
    let controllerRef: AgentController | undefined;

    // Console-based event handler
    const viewAdapter = (event: AgentEvent): void => {
        switch (event.type) {
            case 'session_loaded': {
                const { sessionId, turnCount } = event.data as { sessionId: string; turnCount: number };
                if (turnCount > 0) {
                    console.log(chalk.cyan(`\n↩  Resuming session ${(sessionId as string).slice(-6)} (${turnCount} previous turns)`));
                } else {
                    console.log(chalk.dim(`\n  New session ${(sessionId as string).slice(-6)}`));
                }
                const mode = controllerRef?.getMode();
                if (mode && mode !== 'default') {
                    console.log(chalk.bold.cyan(`  [Mode: ${mode}]`));
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
            case 'install_proposed': {
                const d = event.data as unknown as ProposedInstall;
                console.log(chalk.bold.cyan('\n📦 Package Installation Plan'));
                console.log(chalk.dim('─'.repeat(48)));
                if (d.toInstall.length > 0) {
                    console.log(chalk.green(`To install: ${d.toInstall.join(', ')}`));
                }
                if (d.alreadyInstalled.length > 0) {
                    console.log(chalk.gray(`Already installed: ${d.alreadyInstalled.join(', ')}`));
                }
                d.warnings.forEach(w => console.log(chalk.yellow(`  ⚠  ${w.name}: ${w.message}`)));
                d.blocked.forEach(b => console.log(chalk.red(`  ✗  ${b.name}: ${b.reason}`)));
                console.log(chalk.dim('─'.repeat(48)));
                break;
            }
            case 'error':
                console.error(chalk.red(`Error [${event.data.phase}]: ${event.data.message}`));
                break;
        }
    };

    // Console-based approval callback
    const approvalGate = async (edit: ProposedEdit): Promise<boolean> => {
        return promptConfirm(`Apply changes to ${chalk.cyan(edit.path)}? [Y/n] `);
    };

    const installApprovalGate = async (plan: ProposedInstall): Promise<boolean> => {
        const summary = plan.toInstall.length > 0
            ? `${plan.toInstall.join(', ')}`
            : 'no new packages';
        return promptConfirm(`Install ${chalk.cyan(summary)}? [Y/n] `);
    };

    const controller = deps.createController({
        directory: options.directory,
        viewAdapter,
        approvalGate,
        installApprovalGate,
    });
    controllerRef = controller;

    await controller.initialize({
        sessionId: options.session,
        forceNew: options.new,
    });

    await controller.executeInstruction(instruction);

    // Build VM + config from domain session, then hand off to pure presentation function.
    // This adapter owns the mapping: domain → StatusBarVM (Clean Architecture).
    const session  = controller.getSession();
    const mode     = controller.getMode();
    displayStatusBar(
        {
            model:              session.model,
            usagePercent:       session.tokenBudget.usagePercent,
            health:             session.tokenBudget.health,
            totalCostUSD:       session.totalCostUSD,
            turnCount:          session.turnCount,
            requestsPerMinute:  session.requestsPerMinute,
            lastTokensPerSecond: session.lastTokensPerSecond,
            lastResponseTimeMs: session.lastResponseTimeMs,
            elapsedMs:          session.elapsedMs,
        },
        {
            items:        deps.statusBarItems,
            workflowMode: mode,
        },
    );
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
