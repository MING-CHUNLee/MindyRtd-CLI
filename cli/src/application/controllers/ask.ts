import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';

import { LLMController } from '../../infrastructure/api';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { ContextStatusBar } from '../../presentation/views/context-status-bar';
import { HistorySummarizer } from '../../application/services/history-summarizer';
import { ToolRegistry } from '../../application/orchestration/tool-registry';
import { FileScanTool } from '../../application/tools/file-scan-tool';
import { DirectoryScanner } from '../../infrastructure/filesystem/directory-scanner';
import { FileReadTool } from '../../application/tools/file-read-tool';
import { FileReadService } from '../../application/services/file-read-service';
import { PdfReadTool } from '../../application/tools/pdf-read-tool';
import { LocalFileSystem } from '../../infrastructure/filesystem/local-file-system';
import { ExecuteAskUseCase, AskResult } from '../../application/use-cases/execute-ask-use-case';
import { AgentEvent } from '../facade/agent-service';

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

/**
 * Execute the `ask` sub-command: load/create session, run the Q&A pipeline,
 * persist the turn, and render the context status bar.
 *
 * @param question - The natural-language question to answer
 * @param options  - CLI options (directory, resume, session, new)
 */
export async function executeAskCommand(
    question: string,
    options: AskOptions,
): Promise<void> {
    const repo = new SessionRepository();
    const llm = LLMController.fromEnv();
    const model = llm.getProviderInfo().model;

    // ── Load / create session ─────────────────────────────────────────────────
    let session: ConversationSession;
    if (options.session) {
        session = (await repo.load(options.session)) ?? ConversationSession.create(model);
    } else if (!options.new) {
        session = (await repo.loadLast()) ?? ConversationSession.create(model);
    } else {
        session = ConversationSession.create(model);
        console.log(chalk.dim(`\n  New session ${session.id.slice(-6)}`));
    }

    console.log(chalk.blue(`\n❓ Question: "${question}"\n`));

    // ── History ───────────────────────────────────────────────────────────────
    const summarizer = new HistorySummarizer();
    const history = summarizer.shouldSummarize(session)
        ? await summarizer.summarize(session, llm)
        : session.getHistory().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // ── Wire use case ─────────────────────────────────────────────────────────
    const registry = new ToolRegistry();
    registry.register(new FileScanTool(new DirectoryScanner()));
    const localFs = new LocalFileSystem();
    registry.register(new FileReadTool(new FileReadService(localFs)));
    registry.register(new PdfReadTool(localFs));

    let spinner: Ora | null = null;

    const emit = (type: string, data: Record<string, unknown>): void => {
        // Bridge the string-based EmitFn used by use-cases to the narrowed AgentEvent
        // discriminated union accepted by handleEvent. The cast via unknown is safe
        // because AgentService only ever emits valid AgentEventType literals at runtime.
        const event = { type, data } as unknown as AgentEvent;
        handleEvent(event, spinner, s => { spinner = s; });
    };

    const useCase = new ExecuteAskUseCase({
        llm,
        registry,
        directory: options.directory,
        emit,
    });

    // ── Execute ───────────────────────────────────────────────────────────────
    let result: AskResult;
    try {
        result = await useCase.execute(question, history);
    } catch {
        // error already emitted and printed by handleEvent
        return;
    }

    // ── Persist & render ──────────────────────────────────────────────────────
    session.addTurn(question, result.content, result.usage);
    await repo.save(session);

    const statusBar = new ContextStatusBar();
    statusBar.render(session);
}

// ── Event → terminal renderer ─────────────────────────────────────────────────

function handleEvent(
    event: AgentEvent,
    currentSpinner: Ora | null,
    setSpinner: (s: Ora | null) => void,
): void {
    switch (event.type) {
        case 'phase_start': {
            const desc = String(event.data.description ?? event.data.phase);
            const s = ora(desc).start();
            setSpinner(s);
            break;
        }
        case 'phase_end': {
            if (currentSpinner) {
                event.data.success ? currentSpinner.succeed() : currentSpinner.fail();
                setSpinner(null);
            }
            if (event.data.phase === 'ask') {
                // answer was streamed token-by-token; print enclosing separators
                console.log('\n======================================================\n');
            }
            break;
        }
        case 'stream_token': {
            if (currentSpinner) {
                currentSpinner.stop();
                setSpinner(null);
                console.log('\n======================================================');
            }
            process.stdout.write(chalk.green(String(event.data.token ?? '')));
            break;
        }
        case 'status_update': {
            if (event.data.warning) {
                console.log(chalk.yellow(`  ⚠  ${event.data.warning}`));
            }
            break;
        }
        case 'error': {
            if (currentSpinner) { currentSpinner.fail(); setSpinner(null); }
            console.error(chalk.red(`\n  ✖  ${event.data.message}`));
            break;
        }
        default:
            break;
    }
}
