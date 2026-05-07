/**
 * Use Case: ExecuteInstallUseCase
 *
 * Handles the 'install' intent:
 *   1. Extracts R package names from the instruction.
 *   2. Runs a pre-flight plan (already-installed + safety checks).
 *   3. Emits `install_proposed` so the UI can display the plan.
 *   4. Awaits optional onApproval callback before proceeding.
 *   5. Delegates the actual installation to the r_install tool.
 */

import { ToolRegistry } from '../orchestration/tool-registry';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { RInstallTool, InstallPlan } from '../tools/r-install-tool';

export type { InstallPlan };

export interface InstallResult {
    content: string;
    usage: TurnUsage;
}

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteInstallUseCaseDeps {
    registry: ToolRegistry;
    emit: EmitFn;
    /** Human-in-the-loop callback: returns true to proceed, false to cancel. */
    onApproval?: (plan: InstallPlan) => Promise<boolean>;
}

const ZERO_USAGE: TurnUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
};

export class ExecuteInstallUseCase {
    private readonly registry: ToolRegistry;
    private readonly emit: EmitFn;
    private readonly onApproval?: (plan: InstallPlan) => Promise<boolean>;

    constructor(deps: ExecuteInstallUseCaseDeps) {
        this.registry = deps.registry;
        this.emit = deps.emit;
        this.onApproval = deps.onApproval;
    }

    async execute(instruction: string): Promise<InstallResult> {
        this.emit('phase_start', { phase: 'install', description: 'Installing R packages' });

        const tool = this.registry.get('r_install');
        if (!tool) {
            throw new Error('r_install tool not available');
        }

        // Extract package names: look for word after "install"/"安裝", or fall back to full instruction
        const match = instruction.match(/(?:install|安裝)\s+([\w.,\s]+)/i);
        const packagesRaw = match ? match[1].replace(/\s+/g, ',') : instruction;
        const pkgList = packagesRaw.split(',').map(p => p.trim()).filter(Boolean);

        // Pre-flight + confirmation (only when onApproval is wired and the tool supports plan())
        if (this.onApproval && tool instanceof RInstallTool) {
            const plan = await tool.plan(pkgList);

            this.emit('install_proposed', {
                toInstall:        plan.toInstall,
                alreadyInstalled: plan.alreadyInstalled,
                blocked:          plan.blocked,
                warnings:         plan.warnings,
            });

            const approved = await this.onApproval(plan);
            if (!approved) {
                this.emit('phase_end', { phase: 'install', success: false, summary: 'Installation cancelled' });
                return { content: 'Installation cancelled.', usage: ZERO_USAGE };
            }
        }

        const result = await tool.execute({ packages: pkgList.join(',') });

        this.emit('phase_end', { phase: 'install', success: !result.isError });
        this.emit('text_output', { content: result.content });

        return { content: result.content, usage: ZERO_USAGE };
    }
}
