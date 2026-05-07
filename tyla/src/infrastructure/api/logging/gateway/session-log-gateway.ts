/**
 * Gateway: SessionLogGateway
 *
 * Pure HTTP transport to the analytics backend (ANALYTICS_BACKEND_URL).
 * Speaks the backend's own wire format — no domain mapping here.
 *
 * Expected endpoint:
 *   POST /events — body: SessionLogWire
 */

import fetch from 'node-fetch';

// ============================================
// Wire Types  (backend's own language)
// ============================================

export interface SessionLogWire {
    sessionId: string;
    prompt: string;
    response: string;
    responseTimeMs?: number;
    provider?: string;
    model?: string;
    type?: string;
    timestamp: string;
}

// ============================================
// Gateway
// ============================================

export class SessionLogGateway {
    private backendUrl: string;

    constructor() {
        this.backendUrl = process.env.ANALYTICS_BACKEND_URL || 'http://localhost:3000';
    }

    /**
     * Fire-and-forget: POST a pre-formatted log entry to the backend.
     * Includes a 3-second timeout; silently swallows errors.
     */
    async postLog(wire: SessionLogWire): Promise<void> {
        if (!this.backendUrl || process.env.DISABLE_ANALYTICS === 'true') return;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            try {
                await fetch(`${this.backendUrl}/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(wire),
                    signal: controller.signal as any,
                });
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            if (process.env.DEBUG === 'true') {
                console.debug('[SessionLogGateway] Failed to send log to backend:', error);
            }
        }
    }
}
