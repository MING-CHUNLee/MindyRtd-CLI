#!/usr/bin/env node

/**
 * Mindy RStudio CLI — Entry Dispatcher
 *
 * Pure dispatcher: decides whether to launch TUI or CLI and delegates.
 *
 *   mindy-cli              → Interactive TUI REPL (no subcommand given)
 *   mindy-cli agent "..."  → CLI agent mode
 *   mindy-cli ask "..."    → CLI ask mode
 *   mindy-cli agent rollback [n]  → Rollback session
 */

(async () => {
    const isTUI = process.argv.length === 2;

    if (isTUI) {
        // Dynamic import via Function prevents tsc from type-checking the ESM TUI module
        // (ink requires node16 moduleResolution; the TUI dir is excluded from CJS compilation)
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const load = new Function('p', 'return import(p)') as (p: string) => Promise<{ startTUI: (cfg?: { directory: string }) => Promise<void> }>;
        const { startTUI } = await load('./tui/index.js');
        await startTUI({ directory: process.cwd() });
    } else {
        const { startCLI } = await import('./cli/index');
        await startCLI();
    }
})();
