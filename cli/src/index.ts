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
 *   mindy-cli agent rollback [n]  → Roll back agent session to turn n
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
import { createAgentCommand } from './presentation/cli/agent-cli-adapter';
import { createAskCommand } from './presentation/cli/ask-cli-adapter';
import { createKnowledgeCommand } from './presentation/cli/knowledge-cli-adapter';
import { KnowledgeService } from './application/services/knowledge-service';
import { KnowledgeRepository } from './infrastructure/persistence/knowledge-repository';
import { displayBanner } from './presentation/views/banner';
import fs from 'fs';
import path from 'path';
import { getSettings } from './infrastructure/config/settings';
import { createAgentController } from './composition/create-agent-controller';

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
const settings = getSettings();
const agentCommand = createAgentCommand({
    statusBarItems: settings.statusBar.items,
    createController: ({ directory, viewAdapter, approvalGate, installApprovalGate }) =>
        createAgentController({
            directory,
            viewAdapter,
            approvalGate,
            installApprovalGate,
        }),
});

const askCommand = createAskCommand({
    statusBarItems: settings.statusBar.items,
    createController: ({ directory, viewAdapter }) =>
        createAgentController({
            directory,
            viewAdapter,
            approvalGate: async () => true,
        }),
});

program.addCommand(agentCommand);
program.addCommand(askCommand);

// ── Session / knowledge management ───────────────────────────────────────────
program.addCommand(createKnowledgeCommand({ service: new KnowledgeService(new KnowledgeRepository()) }));

// ── Default action: Launch interactive TUI REPL ──────────────────────────────
program.action(async () => {
    console.log('\n🚀 Launching interactive mode...\n');
    await launchTUI();
});

program.parse(process.argv);
