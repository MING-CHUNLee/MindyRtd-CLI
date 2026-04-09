/**
 * Use Case: ExecuteInstallUseCase
 *
 * Handles the 'install' intent: extracts R package names from the
 * instruction and invokes the r_install tool.
 */

import { ToolRegistry } from '../orchestration/tool-registry';
import { TurnUsage } from '../../domain/entities/conversation-turn';

export interface InstallResult {
    content: string;
    usage: TurnUsage;
}

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export interface ExecuteInstallUseCaseDeps {
    registry: ToolRegistry;
    emit: EmitFn;
}

export class ExecuteInstallUseCase {
    private readonly registry: ToolRegistry;
    private readonly emit: EmitFn;

    constructor(deps: ExecuteInstallUseCaseDeps) {
        this.registry = deps.registry;
        this.emit = deps.emit;
    }

    async execute(instruction: string): Promise<InstallResult> {
        this.emit('phase_start', { phase: 'install', description: 'Installing R packages' });

        const tool = this.registry.get('r_install');
        if (!tool) {
            throw new Error('r_install tool not available');
        }

        // Extract package names: look for word after "install"/"安裝", or fall back to full instruction
        const match = instruction.match(/(?:install|安裝)\s+([\w.,\s]+)/i);
        const packages = match ? match[1].replace(/\s+/g, ',') : instruction;

        const result = await tool.execute({ packages });

        this.emit('phase_end', { phase: 'install', success: !result.isError });
        this.emit('text_output', { content: result.content });

        const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
        return { content: result.content, usage };
    }
}
