/**
 * LogMapper
 *
 * Pure static mapping functions that translate between domain types and
 * backend wire formats. No side effects, no state, no HTTP.
 *
 * Domain types (what callers use) are also defined here so that both
 * gateways and clients import from a single source, avoiding circular deps.
 */

import type { LogEventWire, SessionSummaryRaw } from '../gateway/ruby-log-gateway';
import type { SessionLogWire } from '../gateway/session-log-gateway';

// ============================================
// Domain Types  (caller-facing language)
// ============================================

export interface LogEvent {
    sessionId: string;
    event: 'resolve' | 'edit' | 'ask' | 'agent' | 'error';
    data: Record<string, unknown>;
    /** If omitted, mapper will stamp the current time. */
    timestamp?: string;
}

export interface SessionSummary {
    sessionId: string;
    totalEvents: number;
    summary: string;
}

export interface LogPayload {
    sessionId: string;
    prompt: string;
    response: string;
    responseTimeMs?: number;
    provider?: string;
    model?: string;
    type?: 'resolve' | 'edit' | 'chat';
}

// ============================================
// Mapper
// ============================================

export class LogMapper {
    /**
     * Domain LogEvent → RubyLogGateway wire format.
     * Stamps the current timestamp if the caller did not provide one.
     */
    static toRubyEventWire(event: LogEvent): LogEventWire {
        return {
            sessionId: event.sessionId,
            event: event.event,
            data: event.data,
            timestamp: event.timestamp ?? new Date().toISOString(),
        };
    }

    /**
     * RubyLogGateway raw response → domain SessionSummary.
     * Keeps the two sides decoupled: if the backend renames a field,
     * only this function needs to change.
     */
    static fromSessionSummaryRaw(raw: SessionSummaryRaw): SessionSummary {
        return {
            sessionId: raw.sessionId,
            totalEvents: raw.totalEvents,
            summary: raw.summary,
        };
    }

    /**
     * Domain LogPayload → SessionLogGateway wire format.
     * Stamps the current timestamp.
     */
    static toSessionLogWire(payload: LogPayload): SessionLogWire {
        return {
            sessionId: payload.sessionId,
            prompt: payload.prompt,
            response: payload.response,
            responseTimeMs: payload.responseTimeMs,
            provider: payload.provider,
            model: payload.model,
            type: payload.type,
            timestamp: new Date().toISOString(),
        };
    }
}
