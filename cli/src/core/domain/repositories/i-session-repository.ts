/**
 * Domain Repository Interface: ISessionRepository
 *
 * Defines the contract for session persistence.
 * Infrastructure layer provides the concrete implementation.
 * Domain layer depends on this interface (DIP).
 */

import { ConversationSession } from '../entities/conversation-session';

export interface SessionSummary {
    id: string;
    model: string;
    startedAt: Date;
    turnCount: number;
}

export interface ISessionRepository {
    save(session: ConversationSession): Promise<void>;
    load(sessionId: string): Promise<ConversationSession | null>;
    /** Load the most recently saved session */
    loadLast(): Promise<ConversationSession | null>;
    list(): Promise<SessionSummary[]>;
    delete(sessionId: string): Promise<void>;
}
