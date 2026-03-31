/**
 * Gateway: Ruby Log Client
 *
 * Sends structured log events to the Ruby analytics backend.
 * The Ruby backend stores and analyzes CLI usage logs.
 *
 * Expected Ruby API endpoints:
 *
 *   POST /events
 *   Body: { sessionId, event, data, timestamp }
 *
 *   GET /sessions/:sessionId/summary
 *   Response: { summary, tokenUsage, ... }
 */

import axios, { AxiosError } from 'axios';
import { getEnv } from '../../config';
import { RUBY_API } from '../../config/constants';

// ============================================
// Types
// ============================================

export interface LogEvent {
    sessionId: string;
    event: 'resolve' | 'edit' | 'ask' | 'agent' | 'error';
    data: Record<string, unknown>;
    timestamp?: string;
}

export interface SessionSummary {
    sessionId: string;
    totalEvents: number;
    summary: string;
}

// ============================================
// Ruby Log Client
// ============================================

export class RubyLogClient {
    private baseUrl: string;
    private timeout: number;

    constructor() {
        const host = getEnv('API_HOST') ?? RUBY_API.DEFAULT_HOST;
        const port = getEnv('API_PORT') ?? String(RUBY_API.DEFAULT_PORT);
        this.baseUrl = `http://${host}:${port}`;
        this.timeout = RUBY_API.DEFAULT_TIMEOUT_MS;
    }

    /**
     * Fire-and-forget: log an event to the Ruby analytics backend.
     * Silently swallows errors so it never disrupts the CLI.
     */
    async log(event: LogEvent): Promise<void> {
        try {
            await axios.post(
                `${this.baseUrl}/events`,
                {
                    ...event,
                    timestamp: event.timestamp ?? new Date().toISOString(),
                },
                { timeout: this.timeout }
            );
        } catch {
            // Fire-and-forget — do not propagate errors
        }
    }

    /**
     * Retrieve a session summary from the Ruby analytics backend.
     */
    async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
        try {
            const response = await axios.get<SessionSummary>(
                `${this.baseUrl}/sessions/${sessionId}/summary`,
                { timeout: this.timeout }
            );
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            if (axiosError.code === 'ECONNREFUSED') return null;
            return null;
        }
    }
}
