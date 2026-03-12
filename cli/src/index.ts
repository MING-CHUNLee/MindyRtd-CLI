#!/usr/bin/env node

/**
 * Mindy RStudio CLI
 *
 * An agentic CLI tool for detecting, analyzing, and editing R files
 * in RStudio projects, powered by LLM-based workflows.
 *
 * Entry point:
 *   mindy-cli              → Agent mode (default, interactive)
 *   mindy-cli agent "..."  → Agent mode (one-shot instruction)
 *   mindy-cli <command>    → Direct utility commands (scan, run, install, …)
 *
 * Clean Architecture (dependency flows inward):
 *
 * - domain/          : Core entities, value objects, interfaces (zero deps)
 * - application/
 *     - controllers/ : CLI command handlers (Commander-based)
 *     - services/    : Business logic (Orchestrator, DiffEngine, RBridge, …)
 *     - tools/       : Agent tool implementations (FileScan, FileRead, RExec)
 *     - prompts/     : Prompt templates & section builders
 * - infrastructure/  : External I/O — API clients, persistence, plugins, config
 * - presentation/    : Views, status bar, Ink-based TUI, i18n
 * - shared/          : Cross-cutting types, utils, static data
 */

import { Command } from 'commander';
import { agentCommand } from './application/controllers/agent';
import { askCommand } from './application/controllers/ask';
import { scanCommand } from './application/controllers/scan';
import { libraryCommand } from './application/controllers/library';
import { contextCommand } from './application/controllers/context';
import { runCommand } from './application/controllers/run';
import { installCommand } from './application/controllers/install';
import { editCommand } from './application/controllers/edit';
import { rollbackCommand } from './application/controllers/rollback';
import { knowledgeCommand } from './application/controllers/knowledge';
import { pluginsCommand } from './application/controllers/plugins';
import { tuiCommand } from './application/controllers/tui';
import { displayBanner } from './presentation/views/banner';
import fs from 'fs';
import path from 'path';

// Read version from package.json
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

const program = new Command();

program
    .name('mindy-cli')
    .description('Agentic CLI for R/RStudio projects — powered by LLM workflows')
    .version(version, '-v, --version', 'Display version number')
    .hook('preAction', () => {
        displayBanner();
    });

// ── Primary: Agent ────────────────────────────────────────────────────────────
program.addCommand(agentCommand);
program.addCommand(askCommand);

// ── Utility commands (also available as agent tools) ──────────────────────────
program.addCommand(scanCommand);
program.addCommand(libraryCommand);
program.addCommand(contextCommand);
program.addCommand(runCommand);
program.addCommand(installCommand);
program.addCommand(editCommand);
program.addCommand(rollbackCommand);
program.addCommand(knowledgeCommand);
program.addCommand(pluginsCommand);
program.addCommand(tuiCommand);

// ── Default action: Launch interactive TUI REPL ──────────────────────────────
program.action(async () => {
    console.log('\n🚀 Launching interactive mode...\n');

    // The TUI uses Ink (ESM-only) + JSX, so it must run through tsx.
    // We spawn tsx to execute the TUI source file directly.
    try {
        const { spawn } = await import('child_process');

        // Resolve the TUI entry point (source .tsx, not compiled .js)
        const possiblePaths = [
            path.join(__dirname, '..', 'src', 'presentation', 'tui', 'index.tsx'),
            path.join(process.cwd(), 'src', 'presentation', 'tui', 'index.tsx'),
            path.join(process.cwd(), 'cli', 'src', 'presentation', 'tui', 'index.tsx'),
        ];

        let tuiPath: string | null = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                tuiPath = testPath;
                break;
            }
        }

        if (!tuiPath) {
            console.error('TUI source files not found.');
            console.log('\nSearched in:');
            possiblePaths.forEach(p => console.log(`   - ${p}`));
            console.log('\nUse: mindy-cli agent "your instruction"');
            return;
        }

        const command = `npx tsx "${tuiPath}"`;
        const tsx = spawn(command, [], {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd(),
        });

        tsx.on('error', (error) => {
            console.error('Error starting TUI:', error);
            program.help();
        });

        tsx.on('exit', (code) => {
            process.exit(code || 0);
        });
    } catch (error) {
        console.error('Failed to launch interactive TUI:', error instanceof Error ? error.message : error);
        console.log('\nUse: mindy-cli agent "your instruction"');
        program.help();
    }
});

program.parse(process.argv);
