/**
 * Domain Value Object: TokenBudget
 *
 * Represents the context window health for the *current* LLM request.
 * Built from the latest turn's input tokens vs. the model's max context.
 *
 * Immutable — a new instance is created after every turn.
 */

import { getContextLimit } from '../lib/model-limits';
import { getPricing } from '../lib/token-pricing';

export type ContextHealth = 'healthy' | 'warning' | 'critical' | 'overflow_risk';

export interface TokenUsageSnapshot {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
}

export class TokenBudget {
    readonly maxContextTokens: number;
    readonly usagePercent: number;
    readonly health: ContextHealth;
    readonly estimatedCostUSD: number;

    constructor(
        readonly snapshot: TokenUsageSnapshot,
        readonly model: string,
    ) {
        this.maxContextTokens = getContextLimit(model);
        // Context fill = how large the *input* was (history + system + message)
        this.usagePercent = Math.min(
            100,
            Math.round((snapshot.inputTokens / this.maxContextTokens) * 100),
        );
        this.health = this.computeHealth();
        this.estimatedCostUSD = this.computeCost();
    }

    get totalTokens(): number {
        return this.snapshot.inputTokens + this.snapshot.outputTokens;
    }

    private computeHealth(): ContextHealth {
        if (this.usagePercent >= 95) return 'overflow_risk';
        if (this.usagePercent >= 80) return 'critical';
        if (this.usagePercent >= 60) return 'warning';
        return 'healthy';
    }

    private computeCost(): number {
        const p = getPricing(this.model);
        const M = 1_000_000;
        return (
            (this.snapshot.inputTokens / M) * p.inputPerMillion +
            (this.snapshot.outputTokens / M) * p.outputPerMillion +
            ((this.snapshot.cacheCreationTokens) / M) * p.cacheCreationPerMillion +
            ((this.snapshot.cacheReadTokens) / M) * p.cacheReadPerMillion
        );
    }
}
