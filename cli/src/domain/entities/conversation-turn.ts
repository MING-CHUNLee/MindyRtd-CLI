/**
 * Domain Entity: ConversationTurn
 *
 * Immutable snapshot of one user-instruction → agent-response exchange.
 * Stored append-only inside ConversationSession.
 * Optionally carries structured Artifacts produced during this turn.
 */

import { Artifact, ArtifactJSON } from './artifact';

export interface TurnUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    responseTimeMs?: number;
}

export interface TurnJSON {
    turnNumber: number;
    userMessage: string;
    assistantMessage: string;
    usage: TurnUsage;
    timestamp: string;
    artifacts: ArtifactJSON[];
}

export class ConversationTurn {
    readonly timestamp: Date;

    constructor(
        readonly turnNumber: number,
        readonly userMessage: string,
        readonly assistantMessage: string,
        readonly usage: TurnUsage,
        timestamp?: Date,
        readonly artifacts: Artifact[] = [],
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
            artifacts: this.artifacts.map(a => a.toJSON()),
        };
    }

    static fromJSON(data: TurnJSON): ConversationTurn {
        const artifacts = (data.artifacts ?? []).map(a => Artifact.fromJSON(a));
        return new ConversationTurn(
            data.turnNumber,
            data.userMessage,
            data.assistantMessage,
            data.usage,
            new Date(data.timestamp),
            artifacts,
        );
    }
}
