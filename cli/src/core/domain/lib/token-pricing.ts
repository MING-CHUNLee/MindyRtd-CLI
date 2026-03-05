/**
 * Domain lib: Token Pricing Tables
 *
 * Read-only pricing data (USD per million tokens) per model.
 * Used by value objects to compute estimated costs.
 * No business logic here — pure data.
 */

export interface ModelPricing {
    /** Standard input tokens (USD / 1M) */
    inputPerMillion: number;
    /** Output tokens (USD / 1M) */
    outputPerMillion: number;
    /** Cache write — tokens stored in prompt cache (USD / 1M, typically 25% surcharge) */
    cacheCreationPerMillion: number;
    /** Cache read — tokens read from prompt cache (USD / 1M, typically 90% discount) */
    cacheReadPerMillion: number;
}

export const TOKEN_PRICING: Record<string, ModelPricing> = {
    'claude-opus-4-6': {
        inputPerMillion:          15.00,
        outputPerMillion:         75.00,
        cacheCreationPerMillion:  18.75,
        cacheReadPerMillion:       1.50,
    },
    'claude-sonnet-4-6': {
        inputPerMillion:           3.00,
        outputPerMillion:         15.00,
        cacheCreationPerMillion:   3.75,
        cacheReadPerMillion:       0.30,
    },
    'claude-3-5-sonnet-20241022': {
        inputPerMillion:           3.00,
        outputPerMillion:         15.00,
        cacheCreationPerMillion:   3.75,
        cacheReadPerMillion:       0.30,
    },
    'claude-haiku-4-5-20251001': {
        inputPerMillion:           0.80,
        outputPerMillion:          4.00,
        cacheCreationPerMillion:   1.00,
        cacheReadPerMillion:       0.08,
    },
};

// Fallback to sonnet pricing for unknown models
const DEFAULT_PRICING: ModelPricing = {
    inputPerMillion:           3.00,
    outputPerMillion:         15.00,
    cacheCreationPerMillion:   3.75,
    cacheReadPerMillion:       0.30,
};

export function getPricing(model: string): ModelPricing {
    if (TOKEN_PRICING[model]) return TOKEN_PRICING[model];
    const prefix = Object.keys(TOKEN_PRICING).find(k => model.startsWith(k));
    return prefix ? TOKEN_PRICING[prefix] : DEFAULT_PRICING;
}
