/**
 * Gateway: RubyLogGateway
 *
 * Pure HTTP transport to the Ruby analytics backend.
 * Speaks the backend's own wire format — no domain mapping here.
 *
 * Expected endpoints:
 *   POST /events          — body: LogEventWire
 *   GET  /sessions/:id/summary — response: SessionSummaryRaw
 */

import axios, { AxiosError } from 'axios';
import { getEnv } from '../../../config';
import { RUBY_API } from '../../../config/constants';

// ============================================
// Wire Types  (backend's own language)
// ============================================

export interface LogEventWire {
    sessionId: string;
    event: string;
    data: Record<string, unknown>;
    timestamp: string;
}

export interface SessionSummaryRaw {
    sessionId: string;
    totalEvents: number;
    summary: string;
}

// ============================================
// Gateway
// ============================================

export class RubyLogGateway {
    private baseUrl: string;
    private timeout: number;

    constructor() {
        const host = getEnv('API_HOST') ?? RUBY_API.DEFAULT_HOST;
        const port = getEnv('API_PORT') ?? String(RUBY_API.DEFAULT_PORT);
        this.baseUrl = `http://${host}:${port}`;
        this.timeout = RUBY_API.DEFAULT_TIMEOUT_MS;
    }

    /**
     * Fire-and-forget: POST a pre-formatted event to the backend.
     * Silently swallows errors so it never disrupts the CLI.
     */
    async postEvent(wire: LogEventWire): Promise<void> {
        try {
            await axios.post(`${this.baseUrl}/events`, wire, { timeout: this.timeout });
        } catch {
            // Fire-and-forget — do not propagate errors
        }
    }

    /**
     * Fetch raw session summary from the backend.
     * Returns null on any network or API error.
     */
    async fetchSessionSummary(sessionId: string): Promise<SessionSummaryRaw | null> {
        try {
            const response = await axios.get<SessionSummaryRaw>(
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
