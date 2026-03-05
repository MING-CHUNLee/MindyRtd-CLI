/**
 * Domain Entity: ConversationTurn
 *
 * Immutable snapshot of one user-instruction → agent-response exchange.
 * Stored append-only inside ConversationSession.
 */

export interface TurnUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
}

export interface TurnJSON {
    turnNumber: number;
    userMessage: string;
    assistantMessage: string;
    usage: TurnUsage;
    timestamp: string;
}

export class ConversationTurn {
    readonly timestamp: Date;

    constructor(
        readonly turnNumber: number,
        readonly userMessage: string,
        readonly assistantMessage: string,
        readonly usage: TurnUsage,
        timestamp?: Date,
    ) {
        this.timestamp = timestamp ?? new Date();
    }

    /** Expand this turn into the [user, assistant] messages for LLM history */
    toHistoryMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
        return [
            { role: 'user', content: this.userMessage },
            { role: 'assistant', content: this.assistantMessage },
        ];
    }

    toJSON(): TurnJSON {
        return {
            turnNumber: this.turnNumber,
            userMessage: this.userMessage,
            assistantMessage: this.assistantMessage,
            usage: { ...this.usage },
            timestamp: this.timestamp.toISOString(),
        };
    }

    static fromJSON(data: TurnJSON): ConversationTurn {
        return new ConversationTurn(
            data.turnNumber,
            data.userMessage,
            data.assistantMessage,
            data.usage,
            new Date(data.timestamp),
        );
    }
}
