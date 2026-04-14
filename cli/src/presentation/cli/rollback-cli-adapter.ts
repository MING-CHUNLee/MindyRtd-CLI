/**
 * Presentation: RollbackCliAdapter
 *
 * CLI adapter for `mindy-cli agent rollback ...`.
 */

import { Command } from 'commander';
import chalk from 'chalk';

import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';

export const rollbackCommand = new Command('rollback')
    .description('Roll back the current session to a previous turn')
    .argument('[turn]', 'Turn number to roll back to (0 = clear all)', parseInt)
    .option('--session <id>', 'Target a specific session by ID')
    .option('--list', 'Only list turns without rolling back')
    .addHelpText('after', `
Examples:
  $ mindy agent rollback 2           # keep only the first 2 turns
  $ mindy agent rollback 0           # clear all turns from session
  $ mindy agent rollback --list      # show turn history only
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

    if (targetTurn === undefined || Number.isNaN(targetTurn)) {
        console.error(chalk.red('Missing turn number. Use: mindy agent rollback <n> (or --list)'));
        process.exit(1);
    }

    // Determine target (non-interactive)
    const chosenTurn = targetTurn;

    // Validate
    if (chosenTurn < 0 || chosenTurn > turns.length) {
        console.error(chalk.red(`Invalid turn number: ${chosenTurn}. Must be 0–${turns.length}.`));
        process.exit(1);
    }

    if (chosenTurn === turns.length) {
        console.log(chalk.dim('  Already at this turn — nothing to do.'));
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
