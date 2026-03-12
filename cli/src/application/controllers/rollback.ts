/**
 * Controller: rollback
 *
 * Allows the user to roll back the current (or specified) session to any
 * previous turn, discarding everything that came after it.
 *
 * Usage:
 *   mindy rollback                     # interactive: pick turn from list
 *   mindy rollback 3                   # roll back to after turn 3
 *   mindy rollback 0                   # clear all turns (empty session)
 *   mindy rollback --session <id>      # target a specific session
 */

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';

export const rollbackCommand = new Command('rollback')
    .description('Roll back the current session to a previous turn')
    .argument('[turn]', 'Turn number to roll back to (0 = clear all)', parseInt)
    .option('--session <id>', 'Target a specific session by ID')
    .option('--list', 'Only list turns without rolling back')
    .addHelpText('after', `
Examples:
  $ mindy rollback             # interactive mode — choose from list
  $ mindy rollback 2           # keep only the first 2 turns
  $ mindy rollback 0           # clear all turns from session
  $ mindy rollback --list      # show turn history only
    `)
    .action(async (turn: number | undefined, options: { session?: string; list?: boolean }) => {
        await executeRollbackCommand(turn, options);
    });

async function executeRollbackCommand(
    targetTurn: number | undefined,
    options: { session?: string; list?: boolean },
): Promise<void> {
    const repo = new SessionRepository();

    // Load session
    let session: ConversationSession | null;
    if (options.session) {
        session = await repo.load(options.session);
        if (!session) {
            console.error(chalk.red(`Session "${options.session}" not found.`));
            process.exit(1);
        }
    } else {
        session = await repo.loadLast();
        if (!session) {
            console.error(chalk.red('No active session found. Start one with: mindy agent "..."'));
            process.exit(1);
        }
    }

    const turns = session.turns;

    // Print turn history
    console.log(chalk.bold(`\nSession: ${session.id.slice(-8)} — ${turns.length} turn(s)\n`));
    if (turns.length === 0) {
        console.log(chalk.dim('  (empty session — nothing to roll back)'));
        return;
    }

    turns.forEach((t, i) => {
        const ts = t.timestamp.toLocaleString();
        const preview = t.userMessage.slice(0, 60) + (t.userMessage.length > 60 ? '…' : '');
        console.log(
            chalk.cyan(`  [${i + 1}]`) +
            chalk.dim(` ${ts}`) +
            `  ${preview}`,
        );
    });
    console.log(chalk.dim(`\n  [0] Clear all turns\n`));

    if (options.list) return;

    // Determine target
    let chosenTurn: number;
    if (targetTurn !== undefined) {
        chosenTurn = targetTurn;
    } else {
        chosenTurn = await promptTurnNumber(turns.length);
    }

    // Validate
    if (chosenTurn < 0 || chosenTurn > turns.length) {
        console.error(chalk.red(`Invalid turn number: ${chosenTurn}. Must be 0–${turns.length}.`));
        process.exit(1);
    }

    if (chosenTurn === turns.length) {
        console.log(chalk.dim('  Already at this turn — nothing to do.'));
        return;
    }

    // Confirm
    const action = chosenTurn === 0
        ? 'clear the entire session'
        : `roll back to after turn ${chosenTurn} (dropping ${turns.length - chosenTurn} turn(s))`;
    const confirmed = await confirm(`Roll back: ${action}? [y/N] `);
    if (!confirmed) {
        console.log(chalk.yellow('  Cancelled.'));
        return;
    }

    // Execute rollback
    session.rollbackTo(chosenTurn);
    await repo.save(session);

    const remaining = session.turns.length;
    console.log(chalk.green(`\n✓ Rolled back. Session now has ${remaining} turn(s).`));
    if (remaining === 0) {
        console.log(chalk.dim('  Session is empty. Use "mindy agent" to start a new conversation.'));
    }
}

function promptTurnNumber(max: number): Promise<number> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(chalk.yellow(`Roll back to turn (0–${max}): `), answer => {
            rl.close();
            resolve(parseInt(answer.trim(), 10));
        });
    });
}

function confirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(chalk.yellow(question), answer => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}
