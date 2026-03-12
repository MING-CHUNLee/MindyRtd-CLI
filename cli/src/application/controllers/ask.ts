import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

import { LLMController } from '../../infrastructure/api/llm-controller';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { ContextStatusBar } from '../../presentation/views/context-status-bar';
import { isFilenameEditable, isContentEditable } from '../../domain/lib/agent-file-filters';
import { handleError } from '../../shared/utils/error-handler';
import { HistorySummarizer } from '../../application/services/history-summarizer';

export interface AskOptions {
    directory: string;
    resume: boolean;
    session?: string;
    new: boolean;
}

export const askCommand = new Command('ask')
    .description('Ask a question about the codebase without modifying any files')
    .argument('<question>', 'The question you want to ask')
    .option('-d, --directory <path>', 'Workspace directory to scan', '.')
    .option('--resume', 'Resume the last saved session', false)
    .option('--session <id>', 'Resume a specific session by ID')
    .option('--new', 'Force a new session (ignore last)', false)
    .action(async (question: string, options: AskOptions) => {
        await executeAskCommand(question, options);
    });

export async function executeAskCommand(
    question: string,
    options: AskOptions,
): Promise<void> {
    const repo = new SessionRepository();
    const statusBar = new ContextStatusBar();
    const llm = LLMController.fromEnv();
    const model = llm.getProviderInfo().model;

    let session: ConversationSession;

    if (options.session) {
        session = (await repo.load(options.session)) ?? ConversationSession.create(model);
    } else if (!options.new) {
        // By default, try to resume the last session to maintain context
        const last = await repo.loadLast();
        session = last ?? ConversationSession.create(model);
    } else {
        session = ConversationSession.create(model);
        console.log(chalk.dim(`\n  New session ${session.id.slice(-6)}`));
    }

    console.log(chalk.blue(`\n❓ Question: "${question}"\n`));

    // History Summarization — compress if context window is near limit
    const summarizer = new HistorySummarizer();
    const history = summarizer.shouldSummarize(session)
        ? await summarizer.summarize(session, llm)
        : session.getHistory().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const turnUsage: TurnUsage = {
        inputTokens: 0, outputTokens: 0,
        cacheCreationTokens: 0, cacheReadTokens: 0,
    };

    // ── Phase 0: Scan workspace ───────────────────
    const scanSpinner = ora('Scanning workspace for context…').start();
    let candidates: Array<{ path: string; name: string }> = [];

    try {
        const files = await glob('**/*.{ts,js,R,Rmd,xml,json,md,py,rb,sh}', {
            cwd: path.resolve(options.directory),
            absolute: true,
            ignore: ['**/node_modules/**', '**/dist/**', '**/.*/**'],
        });
        candidates = files
            .filter(f => isFilenameEditable(f))
            .map(f => ({ path: f, name: path.basename(f) }));
        scanSpinner.succeed(`Found ${candidates.length} candidate files`);
    } catch (e) {
        scanSpinner.fail('Workspace scan failed');
        handleError(e, 'ask file scan');
        return;
    }

    // ── Phase 1: Resolve relevant files ────────────────
    const resolveSpinner = ora('Resolving relevant files…').start();
    let targets: string[] = [];

    try {
        const previews = candidates.map(c => ({
            path: path.relative(options.directory, c.path),
            content: '',
        }));

        const result = await llm.resolveFiles(question, previews, history);
        targets = result.targets;

        if (result.usage) {
            turnUsage.inputTokens += result.usage.promptTokens ?? 0;
            turnUsage.outputTokens += result.usage.completionTokens ?? 0;
        }

        if (targets.length > 0) {
            resolveSpinner.succeed(`${targets.length} relevant file(s) found`);
        } else {
            resolveSpinner.info('No relevant files found (Answering based on general knowledge)');
        }
    } catch (e) {
        resolveSpinner.fail('File resolution failed');
        // fallback to answer without files
    }

    // ── Phase 2: Answer the question ───────────────
    const answerSpinner = ora('Generating answer…').start();
    let fileContents = '';

    for (const rel of targets) {
        const abs = path.resolve(options.directory, rel);
        let content = '';
        try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }

        const sizeCheck = isContentEditable(rel, content);
        if (sizeCheck.ok) {
            fileContents += `--- ${rel} ---\n${content}\n\n`;
        }
    }

    let answer = '';
    try {
        answerSpinner.stop();
        console.log('\n======================================================');

        const response = await llm.streamPrompt(
            {
                systemPrompt: 'You are an expert developer assistant. Answer the user\'s question clearly and concisely. Use the provided file contents as context for your answer.',
                userMessage: `Question: ${question}\n\nRelevant Files:\n${fileContents || 'None'}`,
                history,
            },
            (token) => process.stdout.write(chalk.green(token)),
        );

        if (response.usage) {
            turnUsage.inputTokens  += response.usage.promptTokens    ?? 0;
            turnUsage.outputTokens += response.usage.completionTokens ?? 0;
        }
        if (response.responseTimeMs) {
            turnUsage.responseTimeMs = (turnUsage.responseTimeMs ?? 0) + response.responseTimeMs;
        }

        answer = response.content;
        console.log('\n======================================================\n');

    } catch (e) {
        console.log(); // newline after partial stream
        handleError(e, 'ask phase 2');
        return;
    }

    // Record turn
    session.addTurn(question, answer, turnUsage);
    await repo.save(session);

    statusBar.render(session);
}
