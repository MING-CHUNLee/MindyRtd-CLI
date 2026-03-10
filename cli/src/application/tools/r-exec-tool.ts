/**
 * Tool: RExecTool
 *
 * Executes R code via Rscript and returns stdout/stderr.
 * Safety guard: rejects any code that performs side-effects such as
 * writing files, saving data, or invoking system commands.
 */

import { ITool, ToolInput, ToolResult, ToolSchema } from '../domain/interfaces/i-tool';
import { execRscriptCode } from '../services/r-script-runner';

// Patterns that indicate potentially unsafe R code (write side-effects)
const UNSAFE_PATTERNS = /write|sink|file\.create|saveRDS|save\(|system\(/i;

export class RExecTool implements ITool {
    readonly name = 'r_exec';

    readonly schema: ToolSchema = {
        name: 'r_exec',
        description: 'Execute R code using Rscript and return the output. Read-only operations only — code that writes files or runs system commands will be rejected.',
        parameters: {
            code: {
                type: 'string',
                description: 'The R code to execute',
                required: true,
            },
        },
        example: '[ACTION {"tool":"r_exec","input":{"code":"cat(R.version.string)"}}]',
    };

    async execute(input: ToolInput): Promise<ToolResult> {
        const code = input.code as string | undefined;
        if (!code?.trim()) {
            return { content: 'No R code provided.', isError: true };
        }

        if (UNSAFE_PATTERNS.test(code)) {
            return {
                content: 'Rejected: code contains potentially unsafe operations (write/sink/file.create/saveRDS/save/system). Only read-only R code is allowed.',
                isError: true,
            };
        }

        const { stdout, stderr } = await execRscriptCode(code);
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n--- stderr ---\n');
        const content = combined || '(no output)';

        return {
            content,
            isError: false,
            estimatedTokens: Math.ceil(content.length / 4),
        };
    }
}
