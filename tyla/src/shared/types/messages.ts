/**
 * Shared message types for LLM conversation history.
 *
 * Used by: HistorySummarizer, AgentService, ReActLoop
 */

export type SessionMessage = { role: 'user' | 'assistant'; content: string };
