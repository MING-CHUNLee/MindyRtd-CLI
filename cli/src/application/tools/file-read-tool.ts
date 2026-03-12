/**
 * Tool: FileReadTool
 *
 * Reads a file from disk and returns its content.
 * Uses the domain content-size guard to reject oversized files.
 */

import fs from 'fs';
import path from 'path';
import { ITool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/i-tool';
import { isContentEditable } from '../../domain/lib/agent-file-filters';

export class FileReadTool implements ITool {
    readonly name = 'file_read';

    readonly schema: ToolSchema = {
        name: 'file_read',
        description: 'Read the full content of a file from disk. Returns the file content as text.',
        parameters: {
            path: {
                type: 'string',
                description: 'The file path to read (absolute or relative to cwd)',
                required: true,
            },
        },
        example: '[ACTION {"tool":"file_read","input":{"path":"analysis.R"}}]',
    };

    async execute(input: ToolInput): Promise<ToolResult> {
        const filePath = input.path as string | undefined;
        if (!filePath?.trim()) {
            return { content: 'No file path provided.', isError: true };
        }

        const absPath = path.resolve(filePath);

        if (!fs.existsSync(absPath)) {
            return { content: `File not found: ${absPath}`, isError: true };
        }

        let content: string;
        try {
            content = fs.readFileSync(absPath, 'utf8');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: `Failed to read file: ${msg}`, isError: true };
        }

        const sizeCheck = isContentEditable(absPath, content);
        if (!sizeCheck.ok) {
            return {
                content: `File too large to read: ${sizeCheck.reason}`,
                isError: true,
            };
        }

        return {
            content: `--- ${path.basename(absPath)} ---\n${content}`,
            data: content,
            isError: false,
            estimatedTokens: Math.ceil(content.length / 4),
        };
    }
}
