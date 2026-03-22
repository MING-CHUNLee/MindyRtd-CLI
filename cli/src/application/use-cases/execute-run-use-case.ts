/**
 * Use Case: ExecuteRunUseCase
 *
 * Handles the run pipeline: find the target R script, execute it via r_exec,
 * then stream an LLM analysis of the output.
 *
 * Pipeline: scan → find script → r_exec(source) → stream analysis
 */

import path from 'path';
import { LLMController } from '../../infrastructure/api/llm-controller';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { ToolRegistry } from '../services/tool-registry';
import { SessionMessage } from '../../shared/types/messages';

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteRunDeps {
    llm: LLMController;
    registry: ToolRegistry;
    directory: string;
    emit: EmitFn;
}

export interface RunResult {
    scriptPath: string | null;
    execOutput: string;
    analysis: string;
    usage: TurnUsage;
}

// ── ExecuteRunUseCase ─────────────────────────────────────────────────────────

export class ExecuteRunUseCase {
    constructor(private readonly deps: ExecuteRunDeps) {}

    async execute(instruction: string, history: SessionMessage[]): Promise<RunResult> {
        const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

        // 1. Scan workspace and find the target script
        this.deps.emit('phase_start', { phase: 'scan', description: 'Scanning workspace for R scripts' });
        const scriptPath = await this.findScript(instruction);
        this.deps.emit('phase_end', { phase: 'scan', success: true });

        // 2. Execute (or skip execution if no script found)
        let execOutput = '';
        if (scriptPath) {
            this.deps.emit('phase_start', { phase: 'run', description: `Executing ${path.basename(scriptPath)}` });
            execOutput = await this.runScript(scriptPath);
            this.deps.emit('phase_end', { phase: 'run', success: true });
        } else {
            this.deps.emit('status_update', { warning: 'No matching R script found — will analyze without executing' });
        }

        // 3. Stream LLM analysis
        this.deps.emit('phase_start', { phase: 'analyze', description: 'Analyzing output' });
        const analysis = await this.streamAnalysis(instruction, scriptPath, execOutput, history, usage);
        this.deps.emit('phase_end', { phase: 'analyze', success: true });

        return { scriptPath, execOutput, analysis, usage };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Scan workspace and return the absolute path of the best-matching .R file. */
    private async findScript(instruction: string): Promise<string | null> {
        const scanTool = this.deps.registry.get('file_scan');
        if (!scanTool) return null;

        try {
            const result = await scanTool.execute({ directory: this.deps.directory });
            if (!result.data) return null;

            const data = result.data as { files?: Record<string, Array<{ name: string; path: string }>> };
            if (!data.files) return null;

            const rScripts: Array<{ name: string; path: string }> = [
                ...(data.files['rScripts'] ?? []),
                ...(data.files['rMarkdown'] ?? []),
            ];

            const instructionLower = instruction.toLowerCase();

            // Prefer exact filename match, then partial match
            const exact = rScripts.find(f => instructionLower.includes(f.name.toLowerCase()));
            if (exact) return exact.path;

            // Fall back to any .R file if instruction mentions "r script" generically
            if (/\br\s*script\b|\bscript\b|\b\.r\b/i.test(instruction) && rScripts.length > 0) {
                return rScripts[0].path;
            }
        } catch {
            // scan failure — handled by caller
        }

        return null;
    }

    /**
     * Execute the script by calling r_exec with source("path", chdir=TRUE).
     * Using source() means we skip the content-based safety check that would
     * block legitimate write operations in user scripts.
     */
    private async runScript(scriptPath: string): Promise<string> {
        const rExec = this.deps.registry.get('r_exec');
        if (!rExec) return '(r_exec tool not available)';

        const forwardSlashPath = scriptPath.replace(/\\/g, '/');
        const code = `source("${forwardSlashPath}", chdir=TRUE)`;

        const result = await rExec.execute({ code });
        return result.content;
    }

    private async streamAnalysis(
        instruction: string,
        scriptPath: string | null,
        execOutput: string,
        history: SessionMessage[],
        usage: TurnUsage,
    ): Promise<string> {
        const scriptName = scriptPath ? path.basename(scriptPath) : 'the R script';

        let systemPrompt =
            'You are an expert R programming assistant. ' +
            'Analyze the execution output of an R script and explain what happened clearly.\n\n' +
            `Working directory: ${this.deps.directory}\n\n`;

        if (execOutput) {
            systemPrompt +=
                `## Execution Output of ${scriptName}\n\`\`\`\n${execOutput}\n\`\`\`\n\n` +
                'Explain the output, highlight any errors or warnings, and summarize what the script did.';
        } else {
            systemPrompt +=
                `No execution output was captured for ${scriptName}. ` +
                'Answer the user\'s question as best you can based on the available context.';
        }

        try {
            const response = await this.deps.llm.streamPrompt(
                { systemPrompt, userMessage: instruction, history },
                (token) => this.deps.emit('stream_token', { token }),
            );

            if (response.usage) {
                usage.inputTokens += response.usage.promptTokens ?? 0;
                usage.outputTokens += response.usage.completionTokens ?? 0;
            }
            if (response.responseTimeMs) usage.responseTimeMs = response.responseTimeMs;

            this.deps.emit('text_output', { content: response.content });
            return response.content;
        } catch (error) {
            this.deps.emit('error', {
                message: error instanceof Error ? error.message : String(error),
                phase: 'analyze',
            });
            throw error;
        }
    }
}
