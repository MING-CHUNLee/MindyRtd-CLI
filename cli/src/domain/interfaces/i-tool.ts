/**
 * Domain Interface: ITool
 *
 * Contract that every ReAct tool must satisfy.
 * The ToolRegistry uses this interface to execute tools uniformly.
 */

export interface ToolInput {
    [key: string]: unknown;
}

export interface ToolResult {
    /** Human-readable result text (becomes the [OBSERVATION] in the ReAct loop) */
    content: string;
    /** Optional structured data (not sent to LLM, only to callers) */
    data?: unknown;
    /** True when execution failed — content contains the error message */
    isError: boolean;
    /** Rough token estimate for the content string */
    estimatedTokens?: number;
}

export interface ToolParameterSchema {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
}

export interface ToolSchema {
    name: string;
    description: string;
    parameters: Record<string, ToolParameterSchema>;
    /** Example usage shown to the LLM */
    example?: string;
}

export interface ITool {
    readonly name: string;
    readonly schema: ToolSchema;
    execute(input: ToolInput): Promise<ToolResult>;
}
