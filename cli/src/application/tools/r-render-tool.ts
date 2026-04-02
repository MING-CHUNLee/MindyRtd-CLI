/**
 * Tool: RRenderTool
 *
 * Renders an R Markdown (.Rmd) file via rmarkdown::render().
 * Bypasses the r_exec safety guard (which blocks write operations)
 * by calling IRScriptRunner.exec directly.
 */

import path from 'path';
import { AgentTool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/agent-tool';
import { IFileSystem } from '../../domain/interfaces/file-system';
import { IRScriptRunner } from '../../domain/interfaces/r-script-runner';

const VALID_FORMATS = new Set(['html_document', 'pdf_document', 'word_document', 'github_document']);

export class RRenderTool implements AgentTool {
    readonly name = 'r_render';

    readonly schema: ToolSchema = {
        name: 'r_render',
        description: 'Render an R Markdown (.Rmd) file to HTML/PDF/Word using rmarkdown::render().',
        parameters: {
            path: {
                type: 'string',
                description: 'Absolute or relative path to the .Rmd file',
                required: true,
            },
            output_format: {
                type: 'string',
                description: 'Output format: "html_document" (default), "pdf_document", "word_document"',
                required: false,
            },
        },
        example: '[ACTION {"tool":"r_render","input":{"path":"/path/to/Hw5.Rmd"}}]',
    };

    constructor(
        private readonly fileSystem: IFileSystem,
        private readonly rRunner: IRScriptRunner,
    ) {}

    async execute(input: ToolInput): Promise<ToolResult> {
        const filePath = input.path as string | undefined;
        if (!filePath?.trim()) {
            return { content: 'No file path provided.', isError: true };
        }

        if (!this.fileSystem.exists(filePath)) {
            return { content: `File not found: ${filePath}`, isError: true };
        }

        const rawFormat = (input.output_format as string | undefined) ?? 'html_document';
        const outputFormat = VALID_FORMATS.has(rawFormat) ? rawFormat : 'html_document';
        const forwardSlash = filePath.replace(/\\/g, '/');
        const outputDir = path.dirname(forwardSlash).replace(/\\/g, '/');

        const code = `rmarkdown::render("${forwardSlash}", output_format="${outputFormat}", output_dir="${outputDir}")`;

        const { stdout, stderr } = await this.rRunner.exec(code);
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n--- stderr ---\n');
        return {
            content: combined || '(render completed with no output)',
            isError: false,
            estimatedTokens: Math.ceil(combined.length / 4),
        };
    }
}
