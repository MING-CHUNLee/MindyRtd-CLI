/**
 * Controller: agent
 *
 * Multi-turn agentic workflow using the ReAct loop + Orchestrator pattern.
 * The agent can call tools (file_scan, file_read, r_exec) before answering.
 *
 * Workflow per instruction:
 *   Phase 0 — Classify intent (ask vs edit)
 *   Phase 1 — Run Orchestrator (ReAct loop with tool calls)
 *   Phase 2 — Extract edit artifacts
 *   Phase 3 — Show diffs, ask user to accept/reject  ← Safety Gate (unchanged)
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

import { LLMController } from '../../infrastructure/api/llm-controller';
import { DiffEngine } from '../../application/services/diff-engine';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../application/domain/entities/conversation-session';
import { TurnUsage } from '../../application/domain/entities/conversation-turn';
import { ContextStatusBar } from '../../presentation/views/context-status-bar';
import { handleError } from '../../shared/utils/error-handler';

import { ToolRegistry } from '../../application/services/tool-registry';
import { Orchestrator } from '../../application/services/orchestrator';
import { FileScanTool } from '../../application/tools/file-scan-tool';
import { FileReadTool } from '../../application/tools/file-read-tool';
import { RExecTool } from '../../application/tools/r-exec-tool';
import { Evaluator } from '../../application/services/evaluator';
import { HistorySummarizer } from '../../application/services/history-summarizer';
import { Artifact } from '../../application/domain/entities/artifact';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { KnowledgeBase } from '../../application/services/knowledge-base';
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';

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
    const repo = new SessionRepository();
    const statusBar = new ContextStatusBar();
    const llm = LLMController.fromEnv();
    const model = llm.getProviderInfo().model;

    // ── 1. Load or create session ─────────────────────────────────────────
    let session: ConversationSession;

    if (options.session) {
        session = (await repo.load(options.session)) ?? ConversationSession.create(model);
        if (session.turnCount > 0) {
            console.log(chalk.cyan(`\n↩  Resuming session ${session.id.slice(-6)} (${session.turnCount} previous turns)`));
            statusBar.render(session);
        }
    } else if (!options.new) {
        const last = await repo.loadLast();
        if (last) {
            session = last;
            if (session.turnCount > 0) {
                console.log(chalk.cyan(`\n↩  Resuming last session ${session.id.slice(-6)} (${session.turnCount} previous turns)`));
                statusBar.render(session);
            }
        } else {
            session = ConversationSession.create(model);
            console.log(chalk.dim(`\n  New session ${session.id.slice(-6)}`));
        }
    } else {
        session = ConversationSession.create(model);
        console.log(chalk.dim(`\n  New session ${session.id.slice(-6)}`));
    }

    // History Summarization — compress if context window is near limit
    const summarizer = new HistorySummarizer();
    const history = summarizer.shouldSummarize(session)
        ? await summarizer.summarize(session, llm)
        : session.getHistory().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // ── Phase 0: Intent classification ────────────────────────────────────
    const intentSpinner = ora('Classifying instruction intent...').start();
    let intent = 'edit';
    try {
        const intentResponse = await llm.sendPrompt({
            systemPrompt: 'You are an intent classifier. Determine if the user wants to JUST ASK A QUESTION about the codebase/conversation (reply ONLY "ask") or if they want to MAKE CHANGES/CREATE FILES (reply ONLY "edit"). Default to "edit" if unsure.',
            userMessage: instruction,
            history,
        });
        if (intentResponse.content.trim().toLowerCase().includes('ask')) intent = 'ask';
        intentSpinner.succeed(`Intent classified as: ${chalk.cyan(intent)}`);
    } catch {
        intentSpinner.stop();
    }

    if (intent === 'ask') {
        const { executeAskCommand } = await import('./ask');
        return executeAskCommand(instruction, options);
    }

    console.log(chalk.blue(`\n🤖 Instruction: "${instruction}"\n`));

    // ── Phase 1: Orchestrator (ReAct loop) ────────────────────────────────
    const registry = new ToolRegistry();
    registry.register(new FileScanTool());
    registry.register(new FileReadTool());
    registry.register(new RExecTool());

    // Plugin System — load user plugins from ~/.mindy/plugins/
    const pluginLoader = new PluginLoader();
    const pluginMetas = await pluginLoader.loadAll(registry);
    if (pluginMetas.length > 0) {
        const loaded = pluginMetas.filter(m => m.loaded);
        if (loaded.length) console.log(chalk.dim(`  Plugins: ${loaded.map(m => m.name).join(', ')}`));
    }

    // RAG — retrieve relevant knowledge entries
    const kbRepo = new KnowledgeRepository();
    const kb = new KnowledgeBase();
    kb.load(kbRepo.load());
    const knowledgeEntries = kb.retrieve(instruction, 3, path.resolve(options.directory));

    const orchestrator = new Orchestrator(llm, registry);

    const orchSpinner = ora('Running agent (ReAct loop)…').start();

    // Build system prompt with tool awareness + injected knowledge
    const toolSchemas = registry.getSchemas();
    const toolsText = toolSchemas.map(s => `- ${s.name}: ${s.description}`).join('\n');
    let systemPrompt =
        'You are an expert coding agent that can edit files and analyze R code. ' +
        'You have access to tools to explore the workspace before making edits.\n\n' +
        `Working directory: ${path.resolve(options.directory)}\n\n` +
        `Available tools:\n${toolsText}`;

    if (knowledgeEntries.length > 0) {
        const kbText = knowledgeEntries
            .map(e => `### ${e.title}\n${e.content}`)
            .join('\n\n');
        systemPrompt += `\n\n## Relevant Knowledge\n\n${kbText}`;
        console.log(chalk.dim(`  Knowledge: ${knowledgeEntries.map(e => e.title).join(', ')}`));
    }

    const baseRequest = {
        systemPrompt,
        userMessage: instruction,
        history,
        model: undefined as string | undefined,
    };

    let orchResult;
    try {
        orchResult = await orchestrator.run(baseRequest, instruction);
        orchSpinner.succeed(`Agent finished (${orchResult.subTasksRun} sub-task(s), ${orchResult.steps.length} step(s))`);

        // Print ReAct steps summary
        for (const step of orchResult.steps) {
            if (step.thought) console.log(chalk.dim(`  [Step ${step.stepNumber}] ${step.thought.slice(0, 120)}`));
            if (step.action)  console.log(chalk.cyan(`    → Tool: ${step.action.tool}`));
            if (step.observation) console.log(chalk.gray(`    ← ${step.observation.slice(0, 100)}`));
        }
    } catch (e) {
        orchSpinner.fail('Agent loop failed');
        handleError(e, 'orchestrator run');
        return;
    }

    // ── Phase 2: Extract + validate edit artifacts ────────────────────────
    const evaluator = new Evaluator();
    const editArtifacts = orchResult.artifacts.filter(a => a.kind === 'edit');
    const textArtifacts = orchResult.artifacts.filter(a => a.kind === 'text');

    if (textArtifacts.length > 0) {
        console.log('\n======================================================');
        console.log(chalk.green(textArtifacts.map(a => a.content).join('\n\n')));
        console.log('======================================================\n');
    }

    // Validate each edit artifact; retry via Evaluator if malformed
    const validatedEdits: Array<{ path: string; content: string }> = [];
    for (const artifact of editArtifacts) {
        const validation = evaluator.validateEditOutput(artifact.content);
        if (validation.valid && validation.artifacts) {
            validatedEdits.push(...validation.artifacts);
        } else {
            // Evaluator retry: ask LLM to correct its output format
            const corrected = await evaluator.retryWithCorrection(llm, baseRequest, artifact.content);
            const retryValidation = evaluator.validateEditOutput(corrected);
            if (retryValidation.valid && retryValidation.artifacts) {
                console.log(chalk.dim('  Evaluator: output corrected after retry'));
                validatedEdits.push(...retryValidation.artifacts);
            } else {
                // Treat as a raw path+content pair (single file from orchestrator)
                if (artifact.path) validatedEdits.push({ path: artifact.path, content: artifact.content });
            }
        }
    }

    if (validatedEdits.length === 0) {
        if (textArtifacts.length === 0) {
            console.log(chalk.yellow('\nAgent produced no output — exiting'));
        }
        const assistantSummary = textArtifacts.map(a => a.content).join('\n') || 'No changes generated.';
        const domainArtifacts = textArtifacts.map(a =>
            Artifact.create('analysis', a.content));
        session.addTurn(instruction, assistantSummary, orchResult.usage, domainArtifacts);
        await repo.save(session);
        statusBar.render(session);
        return;
    }

    const editedFiles = validatedEdits;

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

        if (original === edit.content) {
            console.log(chalk.dim(`\n  ${edit.path} — no changes, skipping`));
            continue;
        }

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

    // ── Post: Record turn (with Artifacts) → save → render status bar ────────
    const assistantSummary = appliedFiles.length > 0
        ? `Applied changes to: ${appliedFiles.join(', ')}.`
        : 'No changes were applied.';

    // Persist structured Artifacts attached to the turn
    const domainArtifacts: Artifact[] = [
        ...appliedFiles.map(p =>
            Artifact.create('edit', editedFiles.find(e => e.path === p)?.content ?? '', p)),
        ...textArtifacts.map(a => Artifact.create('analysis', a.content)),
    ];

    session.addTurn(instruction, assistantSummary, orchResult.usage, domainArtifacts);
    await repo.save(session);

    console.log(chalk.blue('\n✅ Agent workflow complete.'));
    statusBar.render(session);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
