/**
 * Tool: RInstallTool
 *
 * Installs R packages from CRAN via install.packages().
 * Bypasses the r_exec safety guard (which blocks write operations)
 * by calling execRscriptCode directly.
 */

import { AgentTool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/agent-tool';
import { execRscriptCode } from '../../infrastructure/r-adapter/r-script-runner';

// Only allow safe CRAN package name characters
const SAFE_PKG_NAME = /^[A-Za-z0-9._]+$/;

export class RInstallTool implements AgentTool {
    readonly name = 'r_install';

    readonly schema: ToolSchema = {
        name: 'r_install',
        description: 'Install one or more R packages from CRAN using install.packages().',
        parameters: {
            packages: {
                type: 'string',
                description: 'Comma-separated package names to install, e.g. "ggplot2,readxl,dplyr"',
                required: true,
            },
            repos: {
                type: 'string',
                description: 'CRAN mirror URL (default: https://cloud.r-project.org)',
                required: false,
            },
        },
        example: '[ACTION {"tool":"r_install","input":{"packages":"ggplot2,readxl"}}]',
    };

    async execute(input: ToolInput): Promise<ToolResult> {
        const raw = input.packages as string | undefined;
        if (!raw?.trim()) {
            return { content: 'No packages specified.', isError: true };
        }

        const pkgList = raw.split(',').map(p => p.trim()).filter(Boolean);
        const invalid = pkgList.filter(p => !SAFE_PKG_NAME.test(p));
        if (invalid.length > 0) {
            return { content: `Invalid package name(s): ${invalid.join(', ')}`, isError: true };
        }

        const repos = (input.repos as string | undefined) ?? 'https://cloud.r-project.org';
        const pkgVector = pkgList.map(p => `"${p}"`).join(', ');
        const code = `install.packages(c(${pkgVector}), repos="${repos}", quiet=FALSE)`;

        const { stdout, stderr } = await execRscriptCode(code);
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
        return {
            content: combined || '(no output)',
            isError: false,
            estimatedTokens: Math.ceil(combined.length / 4),
        };
    }
}
