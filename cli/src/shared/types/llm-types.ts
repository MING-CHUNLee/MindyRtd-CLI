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
