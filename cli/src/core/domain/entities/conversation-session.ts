/**
 * Domain Entity: ConversationSession  (Aggregate Root)
 *
 * Tracks the full history of a multi-turn agent conversation:
 *   - Ordered list of ConversationTurns (append-only)
 *   - Cumulative token / cache stats (for cost display)
 *   - Latest-turn context window health (for "Context Anxiety" monitoring)
 *
 * All mutation happens through addTurn() — no direct array access.
 */

import { ConversationTurn, TurnUsage, TurnJSON } from './conversation-turn';
import { TokenBudget, TokenUsageSnapshot } from '../values/token-budget';
import { CacheStatus } from '../values/cache-status';

export interface SessionMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface CumulativeUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCostUSD: number;
}

export interface SessionJSON {
    id: string;
    model: string;
    startedAt: string;
    turns: TurnJSON[];
}

export class ConversationSession {
    private readonly _turns: ConversationTurn[];
    private _cumulative: CumulativeUsage;

    constructor(
        readonly id: string,
        readonly model: string,
        readonly startedAt: Date = new Date(),
        turns: ConversationTurn[] = [],
    ) {
        this._turns = [];
        this._cumulative = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCostUSD: 0 };
        // Replay loaded turns to rebuild cumulative stats
        for (const t of turns) {
            this._turns.push(t);
            this.accumulate(t.usage);
        }
    }

    // ── Read ────────────────────────────────────────────────────────────

    get turns(): ReadonlyArray<ConversationTurn> { return this._turns; }
    get turnCount(): number { return this._turns.length; }

    /**
     * Context window health based on the *latest* turn's input tokens.
     * This is what the user sees on the status bar — how full is the
     * current context window right now?
     */
    get tokenBudget(): TokenBudget {
        const latest = this._turns.at(-1);
        const snapshot: TokenUsageSnapshot = latest
            ? { ...latest.usage }
            : { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
        return new TokenBudget(snapshot, this.model);
    }

    /**
     * Cumulative cache metrics across the whole session.
     */
    get cacheStatus(): CacheStatus {
        return new CacheStatus(
            this._cumulative.cacheCreationTokens,
            this._cumulative.cacheReadTokens,
            this._cumulative.inputTokens,
            this.model,
        );
    }

    /** Cumulative USD cost for the entire session */
    get totalCostUSD(): number { return this._cumulative.totalCostUSD; }

    /**
     * Flattened [user, assistant, user, assistant, …] history
     * ready to be passed as LLMRequest.history.
     */
    getHistory(): SessionMessage[] {
        return this._turns.flatMap(t => t.toHistoryMessages());
    }

    // ── Write ───────────────────────────────────────────────────────────

    addTurn(userMessage: string, assistantMessage: string, usage: TurnUsage): ConversationTurn {
        const turn = new ConversationTurn(
            this._turns.length + 1,
            userMessage,
            assistantMessage,
            usage,
        );
        this._turns.push(turn);
        this.accumulate(usage);
        return turn;
    }

    // ── Serialization ───────────────────────────────────────────────────

    toJSON(): SessionJSON {
        return {
            id: this.id,
            model: this.model,
            startedAt: this.startedAt.toISOString(),
            turns: this._turns.map(t => t.toJSON()),
        };
    }

    static fromJSON(data: SessionJSON): ConversationSession {
        const turns = data.turns.map(t => ConversationTurn.fromJSON(t));
        return new ConversationSession(data.id, data.model, new Date(data.startedAt), turns);
    }

    static create(model: string): ConversationSession {
        const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return new ConversationSession(id, model);
    }

    // ── Private ─────────────────────────────────────────────────────────

    private accumulate(usage: TurnUsage): void {
        this._cumulative.inputTokens         += usage.inputTokens;
        this._cumulative.outputTokens        += usage.outputTokens;
        this._cumulative.cacheCreationTokens += usage.cacheCreationTokens;
        this._cumulative.cacheReadTokens     += usage.cacheReadTokens;
        // Accumulate cost from each turn's budget
        this._cumulative.totalCostUSD += new TokenBudget(usage, this.model).estimatedCostUSD;
    }
}
