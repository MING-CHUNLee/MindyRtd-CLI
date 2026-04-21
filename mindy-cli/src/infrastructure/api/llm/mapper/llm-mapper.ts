/**
 * LlmMapper
 *
 * Pure static mapping functions that convert native provider API responses
 * into the shared LLMResponse shape.  No side effects, no state.
 *
 * Extracted from LlmGateway so provider routing code stays focused on I/O
 * while response normalization is independently testable.
 */

import { LLMResponse } from '../../../../shared/types/llm-types';
import { OpenAIRawResponse, AnthropicRawResponse } from '../gateway/llm-gateway';

type ResponseBody = Omit<LLMResponse, 'responseTimeMs'>;

export class LlmMapper {
    // ── Non-streaming ─────────────────────────────────────────────────────────

    static fromOpenAI(data: OpenAIRawResponse, provider = 'openai'): ResponseBody {
        return {
            content: data.choices[0]?.message?.content || '',
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
            model: data.model,
            provider,
        };
    }

    static fromAnthropic(data: AnthropicRawResponse): ResponseBody {
        return {
            content: data.content[0]?.text || '',
            usage: data.usage ? {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            } : undefined,
            model: data.model,
            provider: 'anthropic',
        };
    }

    static fromAzure(data: OpenAIRawResponse, model: string): ResponseBody {
        return {
            content: data.choices[0]?.message?.content || '',
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
            model,
            provider: 'azure',
        };
    }

    static fromOllama(data: { message?: { content?: string } }, model: string): ResponseBody {
        return {
            content: data.message?.content || '',
            model,
            provider: 'ollama',
        };
    }

    static fromGoogle(
        data: {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        },
        model: string,
    ): ResponseBody {
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const usage = data.usageMetadata ? {
            promptTokens: data.usageMetadata.promptTokenCount ?? 0,
            completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: data.usageMetadata.totalTokenCount ?? 0,
        } : undefined;
        return { content, usage, model, provider: 'google' };
    }

    // ── Streaming helpers ─────────────────────────────────────────────────────

    /**
     * Parse a single `data:` line from an OpenAI SSE stream.
     * Returns the delta text, or null if the line carries no text token.
     */
    static extractOpenAIStreamToken(line: string): string | null {
        if (line === '[DONE]') return null;
        try {
            const data = JSON.parse(line) as {
                choices?: Array<{ delta?: { content?: string } }>;
            };
            return data.choices?.[0]?.delta?.content ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Parse a single `data:` line from an Anthropic SSE stream.
     * Returns a typed event descriptor, or null for unrecognised lines.
     */
    static extractAnthropicStreamEvent(line: string): {
        type: 'content' | 'message_start' | 'message_delta';
        text?: string;
        inputTokens?: number;
        outputTokens?: number;
    } | null {
        try {
            const data = JSON.parse(line) as {
                type?: string;
                delta?: { text?: string };
                usage?: { output_tokens?: number };
                message?: { usage?: { input_tokens: number } };
            };
            if (data.type === 'content_block_delta' && data.delta?.text) {
                return { type: 'content', text: data.delta.text };
            }
            if (data.type === 'message_start' && data.message?.usage) {
                return { type: 'message_start', inputTokens: data.message.usage.input_tokens };
            }
            if (data.type === 'message_delta' && data.usage) {
                return { type: 'message_delta', outputTokens: data.usage.output_tokens ?? 0 };
            }
            return null;
        } catch {
            return null;
        }
    }
}
