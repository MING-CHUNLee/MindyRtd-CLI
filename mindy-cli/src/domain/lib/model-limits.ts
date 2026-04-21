/**
 * Domain lib: Model Context Limits
 *
 * Read-only lookup table mapping model identifiers to their
 * maximum context window size (in tokens).
 * No business logic here — pure data.
 */

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    // Claude 4.x
    'claude-opus-4-6':              200_000,
    'claude-sonnet-4-6':            200_000,
    // Claude 3.x
    'claude-3-5-sonnet-20241022':   200_000,
    'claude-3-5-haiku-20241022':    200_000,
    'claude-3-opus-20240229':       200_000,
    'claude-haiku-4-5-20251001':    200_000,
    // OpenAI
    'gpt-4o':                       128_000,
    'gpt-4o-mini':                  128_000,
    'gpt-4-turbo':                  128_000,
    'gpt-4':                          8_192,
    'gpt-3.5-turbo':                 16_385,
};

export const DEFAULT_CONTEXT_LIMIT = 200_000;

export function getContextLimit(model: string): number {
    // Exact match first
    if (MODEL_CONTEXT_LIMITS[model]) return MODEL_CONTEXT_LIMITS[model];
    // Prefix match for versioned models (e.g. "claude-sonnet-4-6-20250514")
    const prefix = Object.keys(MODEL_CONTEXT_LIMITS).find(k => model.startsWith(k));
    return prefix ? MODEL_CONTEXT_LIMITS[prefix] : DEFAULT_CONTEXT_LIMIT;
}
