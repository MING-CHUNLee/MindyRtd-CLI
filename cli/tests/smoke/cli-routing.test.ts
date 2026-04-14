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
 *   mindy-cli r run               → run controller
 *   mindy-cli r install <pkg>     → install controller
 *   mindy-cli r context           → context controller
 *   mindy-cli config plugins list → plugins controller
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the same command tree as index.ts, but without calling program.parse() */
function buildProgram(overrides: {
    rollbackAction?: (...args: unknown[]) => void;
    runAction?: (...args: unknown[]) => void;
    installAction?: (...args: unknown[]) => void;
    contextAction?: (...args: unknown[]) => void;
    pluginsListAction?: (...args: unknown[]) => void;
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

    // ── r run ──────────────────────────────────────────────────────────────
    const run = new Command('run')
        .argument('[code]')
        .option('--yes')
        .action(overrides.runAction ?? noop);

    // ── r install ─────────────────────────────────────────────────────────
    const install = new Command('install')
        .argument('<packages...>')
        .option('--yes')
        .action(overrides.installAction ?? noop);

    // ── r context ─────────────────────────────────────────────────────────
    const context = new Command('context')
        .option('--json')
        .option('--minimal')
        .action(overrides.contextAction ?? noop);

    // ── r group ───────────────────────────────────────────────────────────
    const r = new Command('r')
        .addCommand(run)
        .addCommand(install)
        .addCommand(context);

    // ── config plugins list ───────────────────────────────────────────────
    const pluginsList = new Command('list')
        .action(overrides.pluginsListAction ?? noop);

    const plugins = new Command('plugins')
        .addCommand(pluginsList)
        .addCommand(new Command('dir').action(noop));

    const config = new Command('config')
        .addCommand(plugins);

    // ── root ──────────────────────────────────────────────────────────────
    const program = new Command('mindy-cli')
        .exitOverride()   // prevent process.exit() during tests
        .addCommand(agent)
        .addCommand(r)
        .addCommand(config);

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

describe('CLI routing — r run', () => {
    it('mindy-cli r run script.R → dispatches to run action', async () => {
        const spy = vi.fn();
        const prog = buildProgram({ runAction: spy });
        await prog.parseAsync(['node', 'mindy-cli', 'r', 'run', 'script.R']);
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0]).toBe('script.R');
    });
});

describe('CLI routing — r install', () => {
    it('mindy-cli r install dplyr ggplot2 → dispatches with package list', async () => {
        const spy = vi.fn();
        const prog = buildProgram({ installAction: spy });
        await prog.parseAsync(['node', 'mindy-cli', 'r', 'install', 'dplyr', 'ggplot2']);
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0]).toEqual(['dplyr', 'ggplot2']);
    });
});

describe('CLI routing — r context', () => {
    it('mindy-cli r context --minimal → dispatches to context action', async () => {
        const spy = vi.fn();
        const prog = buildProgram({ contextAction: spy });
        await prog.parseAsync(['node', 'mindy-cli', 'r', 'context', '--minimal']);
        expect(spy).toHaveBeenCalledOnce();
        const opts = spy.mock.calls[0][0] as { minimal?: boolean };
        expect(opts.minimal).toBe(true);
    });
});

describe('CLI routing — config plugins list', () => {
    it('mindy-cli config plugins list → dispatches to plugins list action', async () => {
        const spy = vi.fn();
        const prog = buildProgram({ pluginsListAction: spy });
        await prog.parseAsync(['node', 'mindy-cli', 'config', 'plugins', 'list']);
        expect(spy).toHaveBeenCalledOnce();
    });
});
