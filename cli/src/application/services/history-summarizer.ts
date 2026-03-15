/**
 * Service: HistorySummarizer
 *
 * Implements History Summarization (§2.2 缺失機制 1) from AGENT_ARCHITECTURE_RUNTIME.md.
 *
 * When the session's context window reaches a warning threshold (≥75% used),
 * this service compresses old conversation turns into a single LLM-generated
 * summary, keeping only the most recent turns verbatim.
 *
 * This prevents hard truncation and preserves semantic continuity.
 *
 * Usage (in agent.ts / ask.ts, before building baseRequest):
 *   const summarizer = new HistorySummarizer();
 *   if (summarizer.shouldSummarize(session)) {
 *     history = await summarizer.summarize(session, llm);
 *   } else {
 *     history = session.getHistory();
 *   }
 */

import { ConversationSession } from '../../domain/entities/conversation-session';
import { LLMController } from '../../infrastructure/api/llm-controller';
import { SessionMessage } from '../../shared/types/messages';

export type { SessionMessage };

export class HistorySummarizer {
    /** Trigger summarization when context window is ≥75% full */
    private readonly THRESHOLD_PERCENT = 75;
    /** Number of most-recent turns to keep verbatim (not summarized) */
    private readonly KEEP_RECENT_TURNS = 3;

    /**
     * Returns true when context health warrants summarizing old history.
     */
    shouldSummarize(session: ConversationSession): boolean {
        const { health, usagePercent } = session.tokenBudget;
        return (
            health === 'critical' ||
            health === 'overflow_risk' ||
            usagePercent >= this.THRESHOLD_PERCENT
        );
    }

    /**
     * Summarize old conversation history using the LLM.
     *
     * The oldest turns (beyond keepRecentTurns) are condensed into one
     * summary assistant message bracketed by user markers, preserving
     * key decisions and context for the LLM.
     *
     * Returns a flat history array ready to use as LLMRequestPayload.history.
     */
    async summarize(
        session: ConversationSession,
        llm: LLMController,
        keepRecentTurns = this.KEEP_RECENT_TURNS,
    ): Promise<SessionMessage[]> {
        const allHistory = session.getHistory();
        const splitAt = Math.max(0, allHistory.length - keepRecentTurns * 2);

        // Nothing old enough to summarize — return as-is
        if (splitAt === 0) return allHistory;

        const oldHistory = allHistory.slice(0, splitAt);
        const recentHistory = allHistory.slice(splitAt);

        const conversation = oldHistory
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n\n');

        let summary: string;
        try {
            const response = await llm.sendPrompt({
                systemPrompt:
                    'You are a concise conversation summarizer. ' +
                    'Summarize the conversation below in 3-5 sentences. ' +
                    'Preserve: key decisions made, files changed, errors encountered, and any open tasks. ' +
                    'Start your response with "Summary of previous conversation:"',
                userMessage: conversation,
            });
            summary = response.content.trim();
        } catch {
            // If summarization fails, fall back to the raw old history
            return allHistory;
        }

        // Inject summary as a synthetic exchange at the start of history
        const compressed: SessionMessage[] = [
            { role: 'user', content: '[Previous conversation compressed — summary follows]' },
            { role: 'assistant', content: summary },
            ...recentHistory,
        ];

        return compressed;
    }
}
