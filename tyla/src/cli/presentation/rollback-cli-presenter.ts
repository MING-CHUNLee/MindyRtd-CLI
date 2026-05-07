/**
 * Presentation: RollbackCliPresenter
 *
 * CLI presenter for `tyla agent rollback ...`.
 */

import { Command } from 'commander';
import chalk from 'chalk';

import type { SessionRepository } from '../../infrastructure/persistence/session-repository';

export interface RollbackCliPresenterDeps {
    repo: SessionRepository;
}

export function createRollbackCommand(deps: RollbackCliPresenterDeps): Command {
    return new Command('rollback')
        .description('Roll back the current session to a previous turn')
        .argument('[turn]', 'Turn number to roll back to (0 = clear all)', parseInt)
        .option('--session <id>', 'Target a specific session by ID')
        .option('--list', 'Only list turns without rolling back')
        .addHelpText('after', `
Examples:
  $ tyla agent rollback 2           # keep only the first 2 turns
  $ tyla agent rollback 0           # clear all turns from session
  $ tyla agent rollback --list      # show turn history only
    `)
        .action(async (turn: number | undefined, options: { session?: string; list?: boolean }) => {
            await executeRollbackCommand(deps.repo, turn, options);
        });
}

async function executeRollbackCommand(
    repo: SessionRepository,
    targetTurn: number | undefined,
    options: { session?: string; list?: boolean },
): Promise<void> {
    // Load session
    const session = options.session
        ? await repo.load(options.session)
        : await repo.loadLast();

    if (!session) {
        const msg = options.session
            ? `Session "${options.session}" not found.`
            : 'No active session found. Start one with: tyla agent "..."';
        console.error(chalk.red(msg));
        process.exit(1);
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
        console.error(chalk.red('Missing turn number. Use: tyla agent rollback <n> (or --list)'));
        process.exit(1);
    }

    if (targetTurn < 0 || targetTurn > turns.length) {
        console.error(chalk.red(`Invalid turn number: ${targetTurn}. Must be 0–${turns.length}.`));
        process.exit(1);
    }

    if (targetTurn === turns.length) {
        console.log(chalk.dim('  Already at this turn — nothing to do.'));
        return;
    }

    session.rollbackTo(targetTurn);
    await repo.save(session);

    const remaining = session.turns.length;
    console.log(chalk.green(`\n✓ Rolled back. Session now has ${remaining} turn(s).`));
    if (remaining === 0) {
        console.log(chalk.dim('  Session is empty. Use "tyla agent" to start a new conversation.'));
    }
}
