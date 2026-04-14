import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';

import { buildAgentDeps } from '../../infrastructure/bootstrap/agent-factory';
import { getSettings } from '../../infrastructure/config/settings';
import { displayStatusBar } from '../../presentation/views/context-status-bar';
import { AgentController, AgentEvent } from './agent-controller';

export interface AskOptions {
    directory: string;
    resume: boolean;
    session?: string;
    new: boolean;
}

export const askCommand = new Command('ask')
    .description('Ask a question about the codebase without modifying any files')
    .argument('<question>', 'The question you want to ask')
    .option('-d, --directory <path>', 'Workspace directory to scan', '.')
    .option('--resume', 'Resume the last saved session', false)
    .option('--session <id>', 'Resume a specific session by ID')
    .option('--new', 'Force a new session (ignore last)', false)
    .action(async (question: string, options: AskOptions) => {
        await executeAskCommand(question, options);
    });

export async function executeAskCommand(
    question: string,
    options: AskOptions,
): Promise<void> {
    let spinner: Ora | null = null;

    const controller = new AgentController(
        { directory: options.directory },
        (event: AgentEvent) => { handleEvent(event, spinner, s => { spinner = s; }); },
        buildAgentDeps(options.directory, async () => true),
    );

    await controller.initialize({
        sessionId: options.session,
        forceNew:  options.new,
    });

    if (options.new) {
        const sessionId = controller.getSession().id;
        console.log(chalk.dim(`\n  New session ${sessionId.slice(-6)}`));
    }

    console.log(chalk.blue(`\n❓ Question: "${question}"\n`));

    await controller.executeAsk(question);

    const session  = controller.getSession();
    const settings = getSettings();
    displayStatusBar(
        {
            model:               session.model,
            usagePercent:        session.tokenBudget.usagePercent,
            health:              session.tokenBudget.health,
            totalCostUSD:        session.totalCostUSD,
            turnCount:           session.turnCount,
            requestsPerMinute:   session.requestsPerMinute,
            lastTokensPerSecond: session.lastTokensPerSecond,
            lastResponseTimeMs:  session.lastResponseTimeMs,
            elapsedMs:           session.elapsedMs,
        },
        { items: settings.statusBar.items },
    );
}

// ── Event → terminal renderer ─────────────────────────────────────────────────

function handleEvent(
    event: AgentEvent,
    currentSpinner: Ora | null,
    setSpinner: (s: Ora | null) => void,
): void {
    switch (event.type) {
        case 'phase_start': {
            const desc = String(event.data.description ?? event.data.phase);
            setSpinner(ora(desc).start());
            break;
        }
        case 'phase_end': {
            if (currentSpinner) {
                event.data.success ? currentSpinner.succeed() : currentSpinner.fail();
                setSpinner(null);
            }
            if (event.data.phase === 'ask') {
                console.log('\n======================================================\n');
            }
            break;
        }
        case 'stream_token': {
            if (currentSpinner) {
                currentSpinner.stop();
                setSpinner(null);
                console.log('\n======================================================');
            }
            process.stdout.write(chalk.green(String(event.data.token ?? '')));
            break;
        }
        case 'status_update': {
            if (event.data.warning) {
                console.log(chalk.yellow(`  ⚠  ${event.data.warning}`));
            }
            break;
        }
        case 'error': {
            if (currentSpinner) { currentSpinner.fail(); setSpinner(null); }
            console.error(chalk.red(`\n  ✖  ${event.data.message}`));
            break;
        }
        default:
            break;
    }
}
