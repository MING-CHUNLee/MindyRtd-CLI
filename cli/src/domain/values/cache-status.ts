/**
 * Domain Value Object: CacheStatus
 *
 * Cumulative prompt-cache metrics for the entire session.
 * Tells the user how much context caching is saving them.
 *
 * Immutable — a new instance is derived from the session's cumulative usage.
 */

import { getPricing } from '../lib/token-pricing';

export class CacheStatus {
    /** USD saved by reading from cache instead of paying full input price */
    readonly estimatedSavingsUSD: number;
    /** Fraction of input tokens that were served from cache (0–1) */
    readonly hitRate: number;

    constructor(
        readonly cacheCreationTokens: number,
        readonly cacheReadTokens: number,
        readonly totalInputTokens: number,
        readonly model: string,
    ) {
        this.hitRate =
            totalInputTokens > 0 ? cacheReadTokens / totalInputTokens : 0;
        this.estimatedSavingsUSD = this.computeSavings();
    }

    get hasCacheActivity(): boolean {
        return this.cacheCreationTokens > 0 || this.cacheReadTokens > 0;
    }

    private computeSavings(): number {
        const p = getPricing(this.model);
        const M = 1_000_000;
        // Saving = (full input price - cache read price) × cache read tokens
        const fullCost = (this.cacheReadTokens / M) * p.inputPerMillion;
        const cacheCost = (this.cacheReadTokens / M) * p.cacheReadPerMillion;
        return Math.max(0, fullCost - cacheCost);
    }
}
