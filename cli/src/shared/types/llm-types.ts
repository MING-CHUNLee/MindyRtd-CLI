/**
 * Shared LLM type definitions — usable across all layers.
 *
 * Extracted here so that core/ and infrastructure/ can both import
 * without creating circular dependencies.
 */

export interface LLMRequestPayload {
    /** System prompt */
    systemPrompt: string;
    /** User's message */
    userMessage: string;
    /** Conversation history (user/assistant turns only — no system entries) */
    history?: { role: 'user' | 'assistant'; content: string }[];
    /** Override default model for this request */
    model?: string;
}

export interface LLMResponse {
    /** LLM's response content */
    content: string;
    /** Token usage information */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    /** Model used for response */
    model: string;
    /** Provider used */
    provider: string;
    /** Response time in ms */
    responseTimeMs?: number;
}

// ── Native API response shapes ─────────────────────────────────────────────────
// Exported so LlmMapper and tests can reference the raw wire types without
// duplicating the definitions inside llm-gateway.ts.

export interface OpenAIRawResponse {
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
    error?: { message?: string };
}

export interface AnthropicRawResponse {
    content: Array<{ text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
    model: string;
    error?: { message?: string };
}
