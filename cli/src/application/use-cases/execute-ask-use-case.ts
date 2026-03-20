/**
 * Use Case: ExecuteAskUseCase
 *
 * Handles the ask / Q&A pipeline: scan workspace for context, read relevant
 * files, assemble a system prompt, and stream the LLM response.
 *
 * Returns AskResult (content + usage) — the caller is responsible for
 * persisting the session turn.
 */

import path from 'path';
import { LLMController } from '../../infrastructure/api/llm-controller';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { ToolRegistry } from '../services/tool-registry';
import { SessionMessage } from '../../shared/types/messages';
import { estimateTokens } from '../prompts';

const MAX_CONTEXT_TOKENS = 6_000;

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteAskDeps {
    llm: LLMController;
    registry: ToolRegistry;
    directory: string;
    emit: EmitFn;
}

export interface AskResult {
    content: string;
    usage: TurnUsage;
}

// ── ExecuteAskUseCase ─────────────────────────────────────────────────────────

export class ExecuteAskUseCase {
    constructor(private readonly deps: ExecuteAskDeps) {}

    async execute(instruction: string, history: SessionMessage[]): Promise<AskResult> {
        const casual = this.isCasualMessage(instruction);

        this.deps.emit('phase_start', { phase: 'scan', description: 'Scanning workspace for context' });
        const { projectContext, scannedFiles } = casual
            ? { projectContext: '', scannedFiles: [] }
            : await this.buildProjectContext();
        this.deps.emit('phase_end', { phase: 'scan', success: true });

        const fileContents = casual ? '' : await this.readRelevantFiles(instruction, scannedFiles);

        this.deps.emit('phase_start', { phase: 'ask', description: 'Generating answer' });
        const systemPrompt = this.assembleAskPrompt(history, instruction, projectContext, fileContents);
        return this.callLLMStream(systemPrompt, instruction, history);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private isCasualMessage(msg: string): boolean {
        const trimmed = msg.trim();
        return (
            trimmed.length < 30 &&
            !/\b(file|code|bug|error|function|class|import|module|project|refactor|test)\b/i.test(trimmed)
        );
    }

    private async buildProjectContext(): Promise<{
        projectContext: string;
        scannedFiles: Array<{ name: string; path: string }>;
    }> {
        let projectContext = '';
        const scannedFiles: Array<{ name: string; path: string }> = [];

        try {
            const scanTool = this.deps.registry.get('file_scan');
            if (scanTool) {
                const scanResult = await scanTool.execute({ directory: this.deps.directory });
                projectContext = scanResult.content;
                if (scanResult.data) {
                    const data = scanResult.data as { files?: Record<string, Array<{ name: string; path: string }>> };
                    if (data.files) {
                        for (const group of Object.values(data.files)) {
                            if (Array.isArray(group)) {
                                scannedFiles.push(...group.map(file => ({ name: file.name, path: file.path })));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.deps.emit('status_update', {
                warning: `Workspace scan failed, continuing without context: ${error instanceof Error ? error.message : String(error)}`,
            });
        }

        return { projectContext, scannedFiles };
    }

    private async readRelevantFiles(
        instruction: string,
        scannedFiles: Array<{ name: string; path: string }>,
    ): Promise<string> {
        const instructionLower = instruction.toLowerCase();
        const readTargets = scannedFiles.filter(file => {
            const nameLower = file.name.toLowerCase();
            if (instructionLower.includes(nameLower)) return true;
            // Also match by extension keyword: "pdf" in instruction matches all .pdf files
            const ext = path.extname(nameLower).slice(1); // e.g. "pdf", "r", "rmd"
            return ext.length > 0 && instructionLower.includes(ext);
        });

        let fileContents = '';
        for (const file of readTargets) {
            try {
                const isPdf = file.name.toLowerCase().endsWith('.pdf');
                const toolName = isPdf ? 'pdf_read' : 'file_read';
                const readTool = this.deps.registry.get(toolName);
                if (readTool) {
                    const result = await readTool.execute({ path: file.path });
                    if (!result.isError) {
                        fileContents += result.content + '\n\n';
                    }
                }
            } catch (error) {
                this.deps.emit('status_update', {
                    warning: `Could not read file ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }

        return fileContents;
    }

    private assembleAskPrompt(
        history: SessionMessage[],
        instruction: string,
        projectContext: string,
        fileContents: string,
    ): string {
        const basePrompt =
            'You are an expert developer assistant. Answer the user\'s question clearly and concisely.\n\n' +
            `Working directory: ${this.deps.directory}\n\n`;

        const historyTokens = estimateTokens(history.map(m => m.content).join('\n'));
        const userTokens = estimateTokens(instruction);
        const baseTokens = estimateTokens(basePrompt);
        let budget = MAX_CONTEXT_TOKENS - historyTokens - userTokens - baseTokens;

        let contextSection = '';
        if (projectContext && budget > 200) {
            const ctxTokens = estimateTokens(projectContext);
            if (ctxTokens <= budget) {
                contextSection = `## Project Context\n${projectContext}\n\n`;
                budget -= ctxTokens;
            } else {
                const maxChars = budget * 4; // rough: 1 token ≈ 4 chars
                contextSection = `## Project Context\n${projectContext.slice(0, maxChars)}\n[…truncated]\n\n`;
                budget = 0;
            }
        }

        let filesSection = '';
        if (fileContents && budget > 200) {
            const fileTokens = estimateTokens(fileContents);
            if (fileTokens <= budget) {
                filesSection = `## File Contents\n${fileContents}`;
            } else {
                const maxChars = budget * 4;
                filesSection = `## File Contents\n${fileContents.slice(0, maxChars)}\n[…truncated]`;
            }
        }

        return basePrompt + contextSection + filesSection;
    }

    private async callLLMStream(
        systemPrompt: string,
        instruction: string,
        history: SessionMessage[],
    ): Promise<AskResult> {
        const turnUsage: TurnUsage = {
            inputTokens: 0, outputTokens: 0,
            cacheCreationTokens: 0, cacheReadTokens: 0,
        };

        try {
            const response = await this.deps.llm.streamPrompt(
                { systemPrompt, userMessage: instruction, history },
                (token) => this.deps.emit('stream_token', { token }),
            );

            if (response.usage) {
                turnUsage.inputTokens += response.usage.promptTokens ?? 0;
                turnUsage.outputTokens += response.usage.completionTokens ?? 0;
            }
            if (response.responseTimeMs) {
                turnUsage.responseTimeMs = response.responseTimeMs;
            }

            this.deps.emit('text_output', { content: response.content });
            this.deps.emit('phase_end', { phase: 'ask', success: true });

            return { content: response.content, usage: turnUsage };
        } catch (error) {
            this.deps.emit('phase_end', { phase: 'ask', success: false });
            this.deps.emit('error', {
                message: error instanceof Error ? error.message : String(error),
                phase: 'ask',
            });
            throw error;
        }
    }
}
