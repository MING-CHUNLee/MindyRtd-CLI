/**
 * Infrastructure: SessionRepository
 *
 * File-based implementation of ISessionRepository.
 * Sessions are stored as JSON at ~/.mindy/sessions/<id>.json
 * The last-used session ID is tracked at ~/.mindy/last-session
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConversationSession } from '../../core/domain/entities/conversation-session';
import { ISessionRepository, SessionSummary } from '../../core/domain/repositories/i-session-repository';

export class SessionRepository implements ISessionRepository {
    private readonly sessionsDir: string;
    private readonly lastSessionFile: string;

    constructor() {
        this.sessionsDir   = path.join(os.homedir(), '.mindy', 'sessions');
        this.lastSessionFile = path.join(os.homedir(), '.mindy', 'last-session');
        fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    async save(session: ConversationSession): Promise<void> {
        const file = this.sessionPath(session.id);
        fs.writeFileSync(file, JSON.stringify(session.toJSON(), null, 2), 'utf-8');
        fs.writeFileSync(this.lastSessionFile, session.id, 'utf-8');
    }

    async load(sessionId: string): Promise<ConversationSession | null> {
        const file = this.sessionPath(sessionId);
        if (!fs.existsSync(file)) return null;
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
            return ConversationSession.fromJSON(data);
        } catch {
            return null;
        }
    }

    async loadLast(): Promise<ConversationSession | null> {
        if (!fs.existsSync(this.lastSessionFile)) return null;
        const lastId = fs.readFileSync(this.lastSessionFile, 'utf-8').trim();
        return this.load(lastId);
    }

    async list(): Promise<SessionSummary[]> {
        if (!fs.existsSync(this.sessionsDir)) return [];
        return fs
            .readdirSync(this.sessionsDir)
            .filter(f => f.endsWith('.json'))
            .map(file => {
                try {
                    const data = JSON.parse(
                        fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8'),
                    );
                    return {
                        id: data.id as string,
                        model: data.model as string,
                        startedAt: new Date(data.startedAt as string),
                        turnCount: (data.turns as unknown[]).length,
                    };
                } catch {
                    return null;
                }
            })
            .filter((s): s is SessionSummary => s !== null)
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    }

    async delete(sessionId: string): Promise<void> {
        const file = this.sessionPath(sessionId);
        if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    private sessionPath(id: string): string {
        return path.join(this.sessionsDir, `${id}.json`);
    }
}
