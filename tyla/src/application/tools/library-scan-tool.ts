/**
 * Tool: LibraryScanTool
 *
 * Scans the R environment for installed packages.
 * Wraps the existing library-scanner infrastructure service.
 */

import { AgentTool, ToolInput, ToolResult, ToolSchema } from '../../domain/types/agent-tool';
import { scanLibraries } from '../../infrastructure/r-adapter/library-scanner';

export class LibraryScanTool implements AgentTool {
    readonly name = 'library_scan';

    readonly schema: ToolSchema = {
        name: 'library_scan',
        description: 'Scan the R environment for installed packages. Returns version, library paths, and a structured list of installed libraries.',
        parameters: {
            includeBase: {
                type: 'string',
                description: 'Whether to include base R packages (true/false, default: false)',
                required: false,
            },
        },
        example: '[ACTION {"tool":"library_scan","input":{}}]',
    };

    async execute(input: ToolInput): Promise<ToolResult> {
        const includeBase = input.includeBase === 'true' || input.includeBase === true;

        const result = await scanLibraries({ includeBase, sortBy: 'name' });

        const content = `R ${result.rVersion} · ${result.totalLibraries} packages (${result.userPackages} user, ${result.basePackages} base)`;

        return {
            content,
            data: result,
            isError: false,
            estimatedTokens: Math.ceil(content.length / 4),
        };
    }
}
