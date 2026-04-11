/**
 * Use Case: ExecuteRunUseCase
 *
 * Handles the run pipeline: find the target R script, execute it via r_exec,
 * then stream an LLM analysis of the output.
 *
 * Pipeline: scan → find script → read script + data files → r_exec(source) → stream analysis
 */

import fs from 'fs';
import path from 'path';
import { LLMGateway } from '../../domain/types/llm-gateway';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { ToolRegistry } from '../orchestration/tool-registry';
import { SessionMessage } from '../../shared/types/messages';

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteRunDeps {
    llm: LLMGateway;
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

interface DataPreview { ref: string; type: 'csv' | 'excel' | 'unknown'; preview: string }

interface RunAnalysisContext {
    instruction: string;
    scriptPath: string | null;
    scriptContent: string | null;
    dataPreviews: DataPreview[];
    execOutput: string;
    history: SessionMessage[];
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

        // 2. If no script found, report immediately — do NOT call the LLM
        if (!scriptPath) {
            const msg = `No matching R or Rmd file found.\n` +
                `Searched in: ${this.deps.directory}\n\n` +
                `If your file is outside this directory, provide the full path in your instruction, e.g.:\n` +
                `  execute C:/Users/Mindy/Desktop/CSDS/Hw5/Hw5.Rmd`;
            this.deps.emit('text_output', { content: msg });
            return { scriptPath: null, execOutput: '', analysis: msg, usage };
        }

        // 3. Read script source and any referenced data files
        const scriptContent = this.readScriptContent(scriptPath);
        const dataPreviews = scriptContent
            ? this.readDataPreviews(path.dirname(scriptPath), this.extractDataFileRefs(scriptContent))
            : [];

        // 4. Execute
        this.deps.emit('phase_start', { phase: 'run', description: `Executing ${path.basename(scriptPath)}` });
        const execOutput = await this.runScript(scriptPath);
        this.deps.emit('phase_end', { phase: 'run', success: true });

        // 5. Stream LLM analysis with full context
        this.deps.emit('phase_start', { phase: 'analyze', description: 'Analyzing output' });
        const analysis = await this.streamAnalysis({
            instruction, scriptPath, scriptContent, dataPreviews, execOutput, history, usage,
        });
        this.deps.emit('phase_end', { phase: 'analyze', success: true });

        return { scriptPath, execOutput, analysis, usage };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Scan workspace and return the absolute path of the best-matching .R/.Rmd file. */
    private async findScript(instruction: string): Promise<string | null> {
        // 1. Try extracting an absolute path directly from the instruction
        // NOTE: Rmd/rmd must come before R in the alternation to avoid .R matching first
        const absMatch = instruction.match(/[A-Za-z]:[\\/][^\s"']+\.(?:Rmd|rmd|R)\b/i)
            ?? instruction.match(/\/[^\s"']+\.(?:Rmd|rmd|R)\b/i);
        if (absMatch) {
            const candidate = absMatch[0].replace(/\\/g, '/');
            if (fs.existsSync(candidate)) return candidate;
        }

        // 2. Fall back to scanning the working directory
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
     * Execute the script.
     * - .R files: source("path", chdir=TRUE)
     * - .Rmd files: rmarkdown::render("path") via r_render tool (bypasses safety guard)
     */
    private async runScript(scriptPath: string): Promise<string> {
        const ext = path.extname(scriptPath).toLowerCase();

        if (ext === '.rmd') {
            const rRender = this.deps.registry.get('r_render');
            if (!rRender) return '(r_render tool not available)';
            const result = await rRender.execute({ path: scriptPath });
            return result.content;
        }

        const rExec = this.deps.registry.get('r_exec');
        if (!rExec) return '(r_exec tool not available)';
        const forwardSlashPath = scriptPath.replace(/\\/g, '/');
        const result = await rExec.execute({ code: `source("${forwardSlashPath}", chdir=TRUE)` });
        return result.content;
    }

    /** Read R/Rmd script source. Returns null on error. */
    private readScriptContent(scriptPath: string): string | null {
        try {
            return fs.readFileSync(scriptPath, 'utf-8');
        } catch {
            return null;
        }
    }

    /** Extract data file paths referenced in the script (CSV, Excel, TSV, TXT). */
    private extractDataFileRefs(scriptContent: string): string[] {
        // Match quoted strings inside common R data-reading functions
        const pattern = /(?:read\.csv|read\.table|read_csv|fread|read_excel|readxl::read_excel|read\.delim|read_tsv|read\.xlsx)\s*\(\s*["']([^"']+)["']/gi;
        const refs: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(scriptContent)) !== null) {
            refs.push(match[1]);
        }
        return [...new Set(refs)];
    }

    /** Read a short preview of each referenced data file. */
    private readDataPreviews(scriptDir: string, refs: string[]): DataPreview[] {
        return refs.map((ref): DataPreview => {
            const absPath = path.isAbsolute(ref) ? ref : path.join(scriptDir, ref);
            const ext = path.extname(ref).toLowerCase();

            if (ext === '.xlsx' || ext === '.xls') {
                const exists = fs.existsSync(absPath);
                return {
                    ref,
                    type: 'excel',
                    preview: exists
                        ? `(Excel file found at ${absPath} — contents not shown; will be read by script)`
                        : `(Excel file NOT found at ${absPath})`,
                };
            }

            // For text-based files (CSV, TSV, TXT) read up to 10 lines
            try {
                const raw = fs.readFileSync(absPath, 'utf-8');
                const lines = raw.split('\n').slice(0, 10).join('\n');
                return { ref, type: 'csv', preview: lines };
            } catch {
                return { ref, type: 'unknown', preview: `(File not found at ${absPath})` };
            }
        });
    }

    /**
     * Truncate a string to maxChars, appending a note if truncated.
     * Priority: execution output > script source > data previews.
     */
    private static truncate(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;
        return text.slice(0, maxChars) + `\n... (truncated — ${text.length - maxChars} chars omitted)`;
    }

    private async streamAnalysis(ctx: RunAnalysisContext): Promise<string> {
        const { instruction, scriptPath, scriptContent, dataPreviews, execOutput, history, usage } = ctx;
        // Token budget for gpt-4o 8k limit:
        //   system boilerplate ~400 tokens, user message ~200, response headroom ~1500
        //   remaining ~5900 tokens ≈ 23600 chars — split conservatively
        const SCRIPT_MAX  = 3_000;  // ~750 tokens
        const PREVIEW_MAX = 1_000;  // ~250 tokens
        const OUTPUT_MAX  = 4_000;  // ~1000 tokens — highest priority (errors live here)

        const scriptName = scriptPath ? path.basename(scriptPath) : 'the R script';

        let systemPrompt =
            'You are an R execution analyzer. ' +
            'The system has already executed the R script using local tools — you do NOT need to tell the user how to run it manually. ' +
            'Your job is to analyze the provided script source, data files, and execution output, then answer the user\'s question.\n\n' +
            `Working directory: ${this.deps.directory}\n\n`;

        if (scriptContent) {
            const src = ExecuteRunUseCase.truncate(scriptContent, SCRIPT_MAX);
            systemPrompt += `## Script Source: ${scriptName}\n\`\`\`r\n${src}\n\`\`\`\n\n`;
        }

        if (dataPreviews.length > 0) {
            systemPrompt += '## Referenced Data Files\n';
            let previewBudget = PREVIEW_MAX;
            for (const dp of dataPreviews) {
                if (previewBudget <= 0) break;
                const preview = ExecuteRunUseCase.truncate(dp.preview, previewBudget);
                previewBudget -= preview.length;
                systemPrompt += `### ${dp.ref}\n\`\`\`\n${preview}\n\`\`\`\n\n`;
            }
        }

        if (execOutput) {
            const out = ExecuteRunUseCase.truncate(execOutput, OUTPUT_MAX);
            systemPrompt +=
                `## Execution Output\n\`\`\`\n${out}\n\`\`\`\n\n` +
                'Explain the output, highlight any errors or warnings, and summarize what the script did.';
        } else if (scriptPath) {
            systemPrompt +=
                `## Execution Output\n(no output was captured — the script may have run silently or failed before producing output)\n\n` +
                'Analyze the script source above and explain what it does or why it may have produced no output.';
        } else {
            systemPrompt +=
                'No script was found matching the instruction. ' +
                'Inform the user that no matching .R or .Rmd file was found in the working directory, ' +
                'and ask them to verify the filename or path.';
        }

        try {
            const response = await this.deps.llm.streamPrompt(
                { systemPrompt, userMessage: instruction, history: [] },
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
