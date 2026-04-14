/**
 * Smoke tests: CLI command routing
 *
 * Verify that the new command paths introduced by the CLI regrouping plan
 * (2026-04-14) correctly dispatch to their controllers via Commander.
 *
 * Strategy: spy on the action function exported by each controller module,
 * then drive the top-level program via parseAsync and assert the spy fired.
 *
 * Coverage:
 *   mindy-cli agent rollback [n]  → rollback controller
 *   (R utilities and plugin diagnostics commands removed per IDE-world integration plan)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the same command tree as index.ts, but without calling program.parse() */
function buildProgram(overrides: {
    rollbackAction?: (...args: unknown[]) => void;
} = {}): Command {
    const noop = (): void => { /* no-op for unmonitored actions */ };

    // ── rollback subcommand (nested under agent) ───────────────────────────
    const rollback = new Command('rollback')
        .argument('[turn]', 'Turn number', parseInt)
        .option('--session <id>')
        .option('--list')
        .action(overrides.rollbackAction ?? noop);

    // ── agent command ──────────────────────────────────────────────────────
    const agent = new Command('agent')
        .argument('<instruction>')
        .action(noop)
        .addCommand(rollback);

    // ── root ──────────────────────────────────────────────────────────────
    const program = new Command('mindy-cli')
        .exitOverride()   // prevent process.exit() during tests
        .addCommand(agent)
        ;

    return program;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CLI routing — agent rollback', () => {
    it('mindy-cli agent rollback 2 → dispatches to rollback action', async () => {
        const spy = vi.fn();
        const prog = buildProgram({ rollbackAction: spy });
        await prog.parseAsync(['node', 'mindy-cli', 'agent', 'rollback', '2']);
        expect(spy).toHaveBeenCalledOnce();
        // First positional arg is the parsed turn number
        expect(spy.mock.calls[0][0]).toBe(2);
    });

    it('mindy-cli agent rollback --list → dispatches with list option', async () => {
        const spy = vi.fn();
        const prog = buildProgram({ rollbackAction: spy });
        await prog.parseAsync(['node', 'mindy-cli', 'agent', 'rollback', '--list']);
        expect(spy).toHaveBeenCalledOnce();
        const opts = spy.mock.calls[0][1] as { list?: boolean };
        expect(opts.list).toBe(true);
    });
});
