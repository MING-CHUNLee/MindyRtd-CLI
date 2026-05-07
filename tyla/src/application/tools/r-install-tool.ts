/**
 * Tool: RInstallTool
 *
 * Installs R packages from CRAN via install.packages().
 * Before installing, performs two pre-flight checks:
 *   1. Already-installed detection — skips packages already on disk.
 *   2. Safety check (PackageValidator) — blocks dangerous packages, warns on risky ones.
 *
 * The plan() method is exposed so ExecuteInstallUseCase can preview the install
 * plan and ask for user confirmation before calling execute().
 */

import { AgentTool, ToolInput, ToolResult, ToolSchema } from '../../domain/types/agent-tool';
import { execRscriptCode } from '../../infrastructure/r-adapter/r-script-runner';
import { PackageValidator } from '../../infrastructure/r-adapter/package-validator';

// Only allow safe CRAN package name characters
const SAFE_PKG_NAME = /^[A-Za-z0-9._]+$/;
const DEFAULT_REPOS = 'https://cloud.r-project.org';

// ─── InstallPlan ──────────────────────────────────────────────────────────────

/**
 * Result of the pre-flight phase: what would happen if we proceed.
 * Exported so ExecuteInstallUseCase can surface it for user confirmation.
 */
export interface InstallPlan {
    toInstall: string[];
    alreadyInstalled: string[];
    blocked: Array<{ name: string; reason: string }>;
    warnings: Array<{ name: string; message: string }>;
}

// ─── RInstallTool ─────────────────────────────────────────────────────────────

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

    constructor(private readonly validator: PackageValidator = new PackageValidator()) {}

    // ── Public pre-flight ──────────────────────────────────────────────────

    /**
     * Compute what install() would do — no side effects.
     * Checks which packages are already installed and runs safety checks.
     */
    async plan(packages: string[], repos: string = DEFAULT_REPOS): Promise<InstallPlan> {
        void repos; // reserved for future per-repo safety checks
        const alreadyInstalled = await this.checkAlreadyInstalled(packages);
        const candidates = packages.filter(p => !alreadyInstalled.includes(p));

        if (candidates.length === 0) {
            return { toInstall: [], alreadyInstalled, blocked: [], warnings: [] };
        }

        const reports = await Promise.all(candidates.map(p => this.validator.validate(p)));

        const blocked = reports
            .filter(r => !r.allowInstallation)
            .map(r => ({ name: r.packageName, reason: r.errors[0] ?? 'blocked by safety check' }));

        const warnings = reports
            .filter(r => r.allowInstallation && r.warnings.length > 0)
            .map(r => ({ name: r.packageName, message: r.warnings.join('; ') }));

        const toInstall = candidates.filter(
            p => reports.find(r => r.packageName === p)?.allowInstallation,
        );

        return { toInstall, alreadyInstalled, blocked, warnings };
    }

    // ── AgentTool.execute ──────────────────────────────────────────────────

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

        const repos = (input.repos as string | undefined) ?? DEFAULT_REPOS;
        const installPlan = await this.plan(pkgList, repos);

        // All already installed
        if (installPlan.toInstall.length === 0 && installPlan.blocked.length === 0) {
            return {
                content: `All packages already installed: ${pkgList.join(', ')}`,
                data: { packageName: pkgList.join(', '), success: true, message: 'All packages already installed' },
                isError: false,
            };
        }

        // All blocked
        if (installPlan.toInstall.length === 0) {
            const blockedNames = installPlan.blocked
                .map(b => `${b.name} (${b.reason})`)
                .join(', ');
            return {
                content: `Installation blocked: ${blockedNames}`,
                data: { packageName: pkgList.join(', '), success: false, message: `Blocked: ${blockedNames}` },
                isError: true,
            };
        }

        // Install safe packages
        const pkgVector = installPlan.toInstall.map(p => `"${p}"`).join(', ');
        const code = `install.packages(c(${pkgVector}), repos="${repos}", quiet=FALSE)`;
        const { stdout, stderr } = await execRscriptCode(code);
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
        const content = combined || '(no output)';

        const parts: string[] = [content];
        if (installPlan.warnings.length > 0) {
            parts.push(`\nWarnings:\n${installPlan.warnings.map(w => `  ${w.name}: ${w.message}`).join('\n')}`);
        }
        if (installPlan.blocked.length > 0) {
            parts.push(`\nSkipped (blocked): ${installPlan.blocked.map(b => b.name).join(', ')}`);
        }
        if (installPlan.alreadyInstalled.length > 0) {
            parts.push(`\nAlready installed: ${installPlan.alreadyInstalled.join(', ')}`);
        }

        return {
            content: parts.join(''),
            data: { packageName: pkgList.join(', '), success: true, message: content },
            isError: false,
            estimatedTokens: Math.ceil(content.length / 4),
        };
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private async checkAlreadyInstalled(packages: string[]): Promise<string[]> {
        const pkgVector = packages.map(p => `"${p}"`).join(', ');
        const code = [
            `pkgs <- c(${pkgVector})`,
            `already <- pkgs[pkgs %in% rownames(installed.packages())]`,
            `cat(paste(already, collapse=","))`,
        ].join('\n');

        try {
            const { stdout } = await execRscriptCode(code);
            const result = stdout.trim();
            return result ? result.split(',').map(p => p.trim()).filter(Boolean) : [];
        } catch {
            // If the check fails, assume nothing is installed to avoid skipping installs
            return [];
        }
    }
}
