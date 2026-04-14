#!/usr/bin/env node

/**
 * Mindy RStudio CLI
 *
 * An agentic CLI tool for detecting, analyzing, and editing R files
 * in RStudio projects, powered by LLM-based workflows.
 *
 * Entry point:
 *   mindy-cli              → Interactive TUI REPL (default)
 *   mindy-cli agent "..."  → Agent mode (one-shot instruction)
 *   mindy-cli ask "..."    → Ask mode (conversational Q&A)
 *   mindy-cli r <command>         → R utilities (run, install, context)
 *   mindy-cli agent rollback [n]  → Roll back agent session to turn n
 *   mindy-cli config plugins ...  → Plugin diagnostics
 *
 * Clean Architecture (dependency flows inward):
 *
 * - domain/          : Core entities, value objects, interfaces, repositories (zero deps)
 * - application/
 *     - controllers/ : CLI command handlers (Commander-based)
 *     - use-cases/   : Orchestrated workflows (ask, instruction pipelines)
 *     - services/    : Business logic (Orchestrator, DiffEngine, RBridge, …)
 *     - tools/       : Agent tool implementations (FileScan, FileRead, RExec)
 *     - prompts/     : Prompt templates & section builders
 * - infrastructure/  : External I/O — API clients, persistence, filesystem, plugins, config, r-adapter
 * - presentation/    : Views, status bar, Ink-based TUI, i18n
 * - shared/          : Cross-cutting types, utils, static data
 */

import { Command } from 'commander';
import { agentCommand } from './presentation/cli/agent-cli-adapter';
import { askCommand } from './application/controllers/ask';
import { rCommand } from './presentation/cli/r-cli-adapter';
import { configCommand } from './presentation/cli/config-cli-adapter';
import { knowledgeCommand } from './application/controllers/knowledge';
import { displayBanner } from './presentation/views/banner';
import fs from 'fs';
import path from 'path';

// Read version from package.json
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

async function launchTUI(): Promise<void> {
    const { spawn } = await import('child_process');
    const possiblePaths = [
        path.join(__dirname, '..', 'src', 'presentation', 'tui', 'index.tsx'),
        path.join(process.cwd(), 'src', 'presentation', 'tui', 'index.tsx'),
        path.join(process.cwd(), 'cli', 'src', 'presentation', 'tui', 'index.tsx'),
    ];
    const tuiPath = possiblePaths.find(p => fs.existsSync(p)) ?? null;
    if (!tuiPath) {
        console.error('TUI source files not found. Searched in:');
        possiblePaths.forEach(p => console.error(`   - ${p}`));
        console.log('\nUse: mindy-cli agent "your instruction"');
        return;
    }
    const tsx = spawn(`npx tsx "${tuiPath}"`, [], { stdio: 'inherit', shell: true, cwd: process.cwd() });
    tsx.on('error', (error) => { console.error('Error starting TUI:', error); });
    tsx.on('exit', (code) => { process.exit(code || 0); });
}

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

// ── R utilities ───────────────────────────────────────────────────────────────
program.addCommand(rCommand);

// ── Session / knowledge management ───────────────────────────────────────────
program.addCommand(knowledgeCommand);

// ── Diagnostics / config ──────────────────────────────────────────────────────
program.addCommand(configCommand);

// ── Default action: Launch interactive TUI REPL ──────────────────────────────
program.action(async () => {
    console.log('\n🚀 Launching interactive mode...\n');
    await launchTUI();
});

program.parse(process.argv);
