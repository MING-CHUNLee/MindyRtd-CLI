/**
 * Service: ToolRegistry
 *
 * Central registry for ReAct loop tools.
 * All errors from execute() are caught and converted to ToolResult
 * so the ReAct loop always receives an observation, never a thrown exception.
 */

import { ITool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/i-tool';

export class ToolRegistry {
    private readonly _tools = new Map<string, ITool>();

    register(tool: ITool): void {
        this._tools.set(tool.name, tool);
    }

    get(name: string): ITool | undefined {
        return this._tools.get(name);
    }

    list(): ITool[] {
        return Array.from(this._tools.values());
    }

    getSchemas(): ToolSchema[] {
        return this.list().map(t => t.schema);
    }

    /**
     * Execute a tool by name.
     * Guarantees: NEVER throws — all errors become ToolResult { isError: true }.
     */
    async execute(name: string, input: ToolInput): Promise<ToolResult> {
        const tool = this._tools.get(name);
        if (!tool) {
            return {
                content: `Tool "${name}" is not registered. Available tools: ${[...this._tools.keys()].join(', ')}`,
                isError: true,
            };
        }
        try {
            return await tool.execute(input);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: `Tool "${name}" threw an error: ${msg}`,
                isError: true,
            };
        }
    }
}
