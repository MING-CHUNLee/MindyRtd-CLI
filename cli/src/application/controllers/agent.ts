/**
 * Controller: agent
 *
 * Multi-turn agentic workflow with conversation memory and real-time
 * context health monitoring (ccstatusline-inspired).
 *
 * Workflow per instruction:
 *   Phase 0 — Scan workspace for candidate files
 *   Phase 1 — LLM resolves which files are relevant  (history-aware)
 *   Phase 2 — LLM generates edits for each file       (history-aware)
 *   Phase 3 — Show diffs, ask user to accept/reject
 *   Post    — Save turn to session, render status bar
 *
 * Session flags:
 *   (default)          create a new session
 *   --resume           resume the last saved session
 *   --session <id>     resume a specific session by ID
 *   --new              force a new session (ignore last)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { glob } from 'glob';

import { LLMController } from '../../infrastructure/api/llm-controller';
import { DiffEngine } from '../../core/services/diff-engine';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../core/domain/entities/conversation-session';
import { TurnUsage } from '../../core/domain/entities/conversation-turn';
import { ContextStatusBar } from '../../presentation/views/context-status-bar';
import { isFilenameEditable, isContentEditable } from '../../core/domain/lib/agent-file-filters';
import { handleError } from '../../shared/utils/error-handler';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentOptions {
    directory: string;
    resume: boolean;
    session?: string;
    new: boolean;
}

// ── Command Definition ────────────────────────────────────────────────────────

export const agentCommand = new Command('agent')
    .description('Run Agent to edit files based on natural language instruction')
    .argument('<instruction>', 'What the agent should do')
    .option('-d, --directory <path>', 'Workspace directory to scan', '.')
    .option('--resume', 'Resume the last saved session', false)
    .option('--session <id>', 'Resume a specific session by ID')
    .option('--new', 'Force a new session (ignore last)', false)
    .addHelpText('after', `
Examples:
  # New session
  $ mindy-cli agent "Add error handling to the scanner"

  # Resume last session (agent remembers previous changes)
  $ mindy-cli agent "Now add tests for those changes" --resume

  # Resume a specific session
  $ mindy-cli agent "Continue the refactor" --session abc123
    `)
    .action(async (instruction: string, options: AgentOptions) => {
        await executeAgentCommand(instruction, options);
    });

// ── Main Execution ────────────────────────────────────────────────────────────

async function executeAgentCommand(
    instruction: string,
    options: AgentOptions,
): Promise<void> {
    const repo      = new SessionRepository();
    const statusBar = new ContextStatusBar();
    const llm       = LLMController.fromEnv();
    const model     = llm.getProviderInfo().model;

    // ── 1. Load or create session ─────────────────────────────────────────
    let session: ConversationSession;

    if (options.session) {
        session = (await repo.load(options.session)) ?? ConversationSession.create(model);
        if (session.turnCount > 0) {
            console.log(chalk.cyan(`\n↩  Resuming session ${session.id.slice(-6)} (${session.turnCount} previous turns)`));
            statusBar.render(session);
        }
    } else if (options.resume && !options.new) {
        const last = await repo.loadLast();
        session = last ?? ConversationSession.create(model);
        if (session.turnCount > 0) {
            console.log(chalk.cyan(`\n↩  Resuming last session ${session.id.slice(-6)} (${session.turnCount} previous turns)`));
            statusBar.render(session);
        }
    } else {
        session = ConversationSession.create(model);
        console.log(chalk.dim(`\n  New session ${session.id.slice(-6)}`));
    }

    console.log(chalk.blue(`\n🤖 Instruction: "${instruction}"\n`));

    // History from all previous turns — passed to every LLM call so the
    // model knows what was done before (this is the "memory").
    const history = session.getHistory().map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
    }));

    // Accumulate token usage across Phase 1 + Phase 2 for this turn
    const turnUsage: TurnUsage = {
        inputTokens: 0, outputTokens: 0,
        cacheCreationTokens: 0, cacheReadTokens: 0,
    };

    // ── Phase 0: Scan workspace (with filename filter) ───────────────────
    const scanSpinner = ora('Phase 0: Scanning workspace…').start();
    let candidates: Array<{ path: string; name: string }> = [];

    try {
        const files = await glob('**/*.{ts,js,R,Rmd,xml,json,md,py,rb,sh}', {
            cwd: path.resolve(options.directory),
            absolute: true,
            ignore: ['**/node_modules/**', '**/dist/**', '**/.*/**'],
        });
        // Domain filter: drop lock files, generated files, non-code extensions
        candidates = files
            .filter(f => isFilenameEditable(f))
            .map(f => ({ path: f, name: path.basename(f) }));
        scanSpinner.succeed(`Phase 0: Found ${candidates.length} editable candidate files`);
    } catch (e) {
        scanSpinner.fail('Phase 0: Workspace scan failed');
        handleError(e, 'agent file scan');
        return;
    }

    // ── Phase 1: Resolve relevant files (history-aware) ──────────────────
    const resolveSpinner = ora('Phase 1: Resolving relevant files…').start();
    let targets: string[] = [];

    try {
        const previews = candidates.map(c => ({
            path: path.relative(options.directory, c.path),
            content: '',
        }));

        const result = await llm.resolveFiles(instruction, previews, history);
        targets = result.targets;
        accumulateUsage(turnUsage, result.usage);

        if (targets.length > 0) {
            resolveSpinner.succeed(`Phase 1: ${targets.length} file(s) selected`);
            targets.forEach(t => console.log(chalk.dim(`  - ${t}`)));
        } else {
            resolveSpinner.info('Phase 1: No relevant files found — exiting');
            return;
        }
    } catch (e) {
        resolveSpinner.fail('Phase 1 failed');
        handleError(e, 'phase 1 resolve');
        return;
    }

    // ── Phase 2: Generate edits one file at a time (history-aware) ──────
    //
    // Each file gets its own LLM call instead of batching everything into
    // one giant message. This keeps each request small regardless of how
    // many files were resolved.
    //
    console.log(chalk.dim('\nPhase 2: Generating edits…'));
    const editedFiles: Array<{ path: string; content: string }> = [];

    for (const rel of targets) {
        const abs = path.resolve(options.directory, rel);
        let content = '';
        try { content = fs.readFileSync(abs, 'utf8'); } catch { /* new file */ }

        // Content-size filter: skip files that would blow the token budget
        const sizeCheck = isContentEditable(rel, content);
        if (!sizeCheck.ok) {
            console.log(chalk.yellow(`  ⚠ Skipped — ${sizeCheck.reason}`));
            continue;
        }

        const fileSpinner = ora(`  Editing ${path.basename(rel)}…`).start();
        try {
            const result = await llm.editFiles(instruction, [{ path: rel, content }], history);
            accumulateUsage(turnUsage, result.usage);
            if (result.files.length > 0) {
                editedFiles.push(...result.files);
                fileSpinner.succeed(`  ${path.basename(rel)} — edit received`);
            } else {
                fileSpinner.warn(`  ${path.basename(rel)} — no edit returned`);
            }
        } catch (e) {
            fileSpinner.fail(`  ${path.basename(rel)} — edit failed`);
            handleError(e, `phase 2 edit: ${rel}`);
        }
    }

    if (editedFiles.length === 0) {
        console.log(chalk.yellow('\nPhase 2: No edits generated — exiting'));
        return;
    }
    console.log(chalk.green(`Phase 2: Edits received for ${editedFiles.length} file(s)`));

    // ── Phase 3: Human-in-the-Loop Review ────────────────────────────────
    //
    // Security guarantee: the CLI is strictly locked from writing to disk
    // until the user explicitly types [Y/n] for each file.
    // No file is ever modified without an affirmative confirmation.
    //
    const engine = new DiffEngine();
    const appliedFiles: string[] = [];

    for (const edit of editedFiles) {
        const absPath = path.resolve(options.directory, edit.path);

        let original = '';
        try { original = fs.readFileSync(absPath, 'utf8'); } catch { /* new file */ }

        // Skip silently if LLM returned identical content
        if (original === edit.content) {
            console.log(chalk.dim(`\n  ${edit.path} — no changes, skipping`));
            continue;
        }

        // Render diff using the shared DiffEngine (🟢 additions / 🔴 deletions)
        console.log(chalk.bold(`\n📄 ${edit.path}`));
        console.log(chalk.dim('─'.repeat(56)));
        console.log(engine.generateColoredDiff(original, edit.content));
        console.log(chalk.dim('─'.repeat(56)));

        // ⛔ WRITE LOCK — file is not touched until explicit [Y/n]
        const approved = await promptConfirm(`Apply changes to ${chalk.cyan(edit.path)}? [Y/n] `);
        if (approved) {
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, edit.content, 'utf8');
            console.log(chalk.green(`✓ Written: ${edit.path}`));
            appliedFiles.push(edit.path);
        } else {
            console.log(chalk.yellow(`✗ Rejected: ${edit.path} — disk untouched`));
        }
    }

    // ── Post: Record turn → save → render status bar ──────────────────────
    const assistantSummary = appliedFiles.length > 0
        ? `Applied changes to: ${appliedFiles.join(', ')}.`
        : 'No changes were applied.';

    session.addTurn(instruction, assistantSummary, turnUsage);
    await repo.save(session);

    console.log(chalk.blue('\n✅ Agent workflow complete.'));
    statusBar.render(session);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function accumulateUsage(
    acc: TurnUsage,
    usage: { promptTokens?: number; completionTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number } | undefined,
): void {
    if (!usage) return;
    acc.inputTokens         += usage.promptTokens         ?? 0;
    acc.outputTokens        += usage.completionTokens     ?? 0;
    acc.cacheCreationTokens += usage.cacheCreationTokens  ?? 0;
    acc.cacheReadTokens     += usage.cacheReadTokens      ?? 0;
}

function promptConfirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(chalk.yellow(question), answer => {
            rl.close();
            const n = answer.trim().toLowerCase();
            resolve(n === '' || n === 'y' || n === 'yes');
        });
    });
}
