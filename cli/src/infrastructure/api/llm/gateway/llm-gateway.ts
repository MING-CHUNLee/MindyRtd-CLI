/**
 * LlmGateway — Infrastructure implementation of the LLMGateway domain interface.
 *
 * Handles communication with LLM APIs (OpenAI, Anthropic, Azure, Gemini, Ollama).
 * All provider-specific response mapping is delegated to LlmMapper.
 *
 * Architecture References:
 * - LangChain: Provider abstraction pattern
 * - Vercel AI SDK: Unified interface for multiple providers
 * - Clean Architecture: Gateway/Adapter pattern
 *
 * Best Practices:
 * - API keys loaded from environment variables (never hardcoded)
 * - Provider-agnostic interface
 * - Automatic retry with exponential backoff
 * - Proper error handling and typing
 * - Input validation before API calls
 */
import { LLMRequestPayload, LLMResponse, OpenAIRawResponse, AnthropicRawResponse } from '../../../../shared/types/llm-types';
import { LLMGateway } from '../../../../domain/interfaces/llm-gateway';
import { LLMConfig, getLLMConfigFromEnv, LLMProvider } from '../../../config';
import { LLM } from '../../../config/constants';
import { SessionLogGateway } from '../../logging/gateway/session-log-gateway';
import { LogMapper } from '../../logging/mapper/log-mapper';
import { LlmMapper } from '../mapper/llm-mapper';

// ============================================
// Error Classes
// ============================================

export class LLMValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LLMValidationError';
    }
}

export class LLMAPIError extends Error {
    constructor(
        message: string,
        public readonly provider: LLMProvider,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = 'LLMAPIError';
    }
}

// ============================================
// Types
// ============================================

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export type { LLMRequestPayload as LLMRequest, LLMResponse } from '../../../../shared/types/llm-types';

export interface LlmGatewayOptions {
    /** Override config from environment */
    config?: Partial<LLMConfig>;
    /** Enable retry on failure */
    enableRetry?: boolean;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Session ID for analytics */
    sessionId?: string;
}

// ============================================
// LlmGateway
// ============================================

export class LlmGateway implements LLMGateway {
    private config: LLMConfig;
    private enableRetry: boolean;
    private maxRetries: number;
    private sessionLogGateway: SessionLogGateway;
    public readonly sessionId: string;

    /**
     * Create an LlmGateway
     *
     * @example
     * // Use environment configuration (recommended)
     * const gateway = LlmGateway.fromEnv();
     *
     * // Or with custom options
     * const gateway = new LlmGateway({
     *     config: { model: 'gpt-3.5-turbo' }
     * });
     */
    constructor(options: LlmGatewayOptions = {}) {
        const envConfig = getLLMConfigFromEnv();
        this.config = {
            ...envConfig,
            ...options.config,
        };
        this.enableRetry = options.enableRetry ?? true;
        this.maxRetries = options.maxRetries ?? 3;
        this.sessionLogGateway = new SessionLogGateway();
        this.sessionId = options.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Factory method: Create gateway from environment variables
     */
    static fromEnv(sessionId?: string): LlmGateway {
        return new LlmGateway({ sessionId });
    }

    /**
     * Send a prompt to the LLM and get a response
     */
    async sendPrompt(request: LLMRequestPayload): Promise<LLMResponse> {
        this.validateRequest(request);

        const messages: LLMMessage[] = [
            { role: 'system', content: request.systemPrompt },
            ...(request.history || []),
            { role: 'user', content: request.userMessage },
        ];

        const model = request.model || this.config.model;
        const startTime = Date.now();

        const result = await this.executeWithRetry(() =>
            this.sendToProvider(messages, model)
        );

        const responseTimeMs = Date.now() - startTime;
        const fullResult = {
            ...result,
            responseTimeMs,
        };

        // Fire-and-forget analytics logging
        this.sessionLogGateway.postLog(LogMapper.toSessionLogWire({
            sessionId: this.sessionId,
            prompt: request.userMessage,
            response: fullResult.content,
            responseTimeMs: fullResult.responseTimeMs,
            provider: fullResult.provider,
            model: fullResult.model,
        })).catch(() => { });

        return fullResult;
    }

    // ============================================
    // Validation
    // ============================================

    private validateRequest(request: LLMRequestPayload): void {
        if (!request.systemPrompt?.trim()) {
            throw new LLMValidationError('System prompt is required and cannot be empty');
        }

        if (request.systemPrompt.length > LLM.MAX_SYSTEM_PROMPT_LENGTH) {
            throw new LLMValidationError(
                `System prompt exceeds maximum length of ${LLM.MAX_SYSTEM_PROMPT_LENGTH} characters`
            );
        }

        if (!request.userMessage?.trim()) {
            throw new LLMValidationError('User message is required and cannot be empty');
        }

        if (request.userMessage.length > LLM.MAX_USER_MESSAGE_LENGTH) {
            throw new LLMValidationError(
                `User message exceeds maximum length of ${LLM.MAX_USER_MESSAGE_LENGTH} characters`
            );
        }

        if (request.history) {
            for (const msg of request.history) {
                if (!msg.content?.trim()) {
                    throw new LLMValidationError('History messages cannot have empty content');
                }
                if (!['system', 'user', 'assistant'].includes(msg.role)) {
                    throw new LLMValidationError(`Invalid message role: ${msg.role}`);
                }
            }
        }
    }

    /**
     * Get current provider info (safe to log, no secrets)
     */
    getProviderInfo(): { provider: string; model: string; endpoint?: string } {
        return {
            provider: this.config.provider,
            model: this.config.model,
            endpoint: this.config.endpoint || undefined,
        };
    }

    // ============================================
    // Provider Router
    // ============================================

    private async sendToProvider(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        switch (this.config.provider) {
            case 'openai':
                return this.sendToOpenAI(messages, model);
            case 'anthropic':
                return this.sendToAnthropic(messages, model);
            case 'azure':
                return this.sendToAzure(messages, model);
            case 'google':
                return this.sendToGoogle(messages, model);
            case 'ollama':
                return this.sendToOllama(messages, model);
            default:
                throw new Error(`Unsupported provider: ${this.config.provider}`);
        }
    }

    // ============================================
    // Provider Implementations
    // ============================================

    private async sendToOpenAI(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const response = await this.fetchWithTimeout(this.config.endpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: this.config.maxTokens,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json() as OpenAIRawResponse;
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json() as OpenAIRawResponse;
        return LlmMapper.fromOpenAI(data);
    }

    private async sendToAnthropic(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const conversationMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }));

        const response = await this.fetchWithTimeout(this.config.endpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: this.config.maxTokens,
                system: systemMessage,
                messages: conversationMessages,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json() as AnthropicRawResponse;
            throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json() as AnthropicRawResponse;
        return LlmMapper.fromAnthropic(data);
    }

    private async sendToAzure(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const response = await this.fetchWithTimeout(this.config.endpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.config.apiKey,
            },
            body: JSON.stringify({
                messages,
                max_tokens: this.config.maxTokens,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json() as OpenAIRawResponse;
            throw new Error(`Azure OpenAI error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json() as OpenAIRawResponse;
        return LlmMapper.fromAzure(data, model);
    }

    private async sendToOllama(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const response = await this.fetchWithTimeout(this.config.endpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.statusText}`);
        }

        const data = await response.json() as { message?: { content?: string } };
        return LlmMapper.fromOllama(data, model);
    }

    private async sendToGoogle(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const url = `${this.config.endpoint}/${model}:generateContent?key=${this.config.apiKey}`;

        const systemMessage = messages.find(m => m.role === 'system');
        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

        const body: Record<string, unknown> = {
            contents,
            generationConfig: { maxOutputTokens: this.config.maxTokens },
        };

        if (systemMessage) {
            body.systemInstruction = { parts: [{ text: systemMessage.content }] };
        }

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API error: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json() as Parameters<typeof LlmMapper.fromGoogle>[0];
        return LlmMapper.fromGoogle(data, model);
    }

    // ============================================
    // Utilities
    // ============================================

    private async fetchWithTimeout(
        url: string,
        options: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async executeWithRetry<T>(
        fn: () => Promise<T>,
        attempt = 1
    ): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            if (!this.enableRetry || attempt >= this.maxRetries) {
                throw error;
            }

            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await this.sleep(delay);

            return this.executeWithRetry(fn, attempt + 1);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // Streaming
    // ============================================

    /**
     * Stream a prompt response token-by-token.
     *
     * Calls `onToken` for each text chunk as it arrives (SSE).
     * Returns the complete LLMResponse (same shape as sendPrompt) when done.
     *
     * Supported providers: openai, anthropic.
     * Falls back to sendPrompt() for azure, google, ollama.
     */
    async streamPrompt(
        request: LLMRequestPayload,
        onToken: (token: string) => void,
    ): Promise<LLMResponse> {
        this.validateRequest(request);

        const messages: LLMMessage[] = [
            { role: 'system', content: request.systemPrompt },
            ...(request.history || []),
            { role: 'user', content: request.userMessage },
        ];
        const model = request.model || this.config.model;
        const startTime = Date.now();

        let result: Omit<LLMResponse, 'responseTimeMs'>;

        if (this.config.provider === 'openai' || this.config.provider === 'azure') {
            result = await this.streamFromOpenAI(messages, model, onToken);
        } else if (this.config.provider === 'anthropic') {
            result = await this.streamFromAnthropic(messages, model, onToken);
        } else {
            result = await this.sendToProvider(messages, model);
            onToken(result.content);
        }

        return { ...result, responseTimeMs: Date.now() - startTime };
    }

    private async streamFromOpenAI(
        messages: LLMMessage[],
        model: string,
        onToken: (token: string) => void,
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const response = await this.fetchWithTimeout(this.config.endpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: this.config.maxTokens,
                stream: true,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI stream error: ${response.statusText} — ${err}`);
        }

        let fullContent = '';
        let promptTokens = 0;
        let completionTokens = 0;

        await this.readSSEStream(response, (line) => {
            // Try extracting usage from the full line JSON (usage object appears on some responses)
            if (line !== '[DONE]') {
                try {
                    const data = JSON.parse(line) as {
                        usage?: { prompt_tokens: number; completion_tokens: number };
                    };
                    if (data.usage) {
                        promptTokens = data.usage.prompt_tokens;
                        completionTokens = data.usage.completion_tokens;
                    }
                } catch { /* skip */ }
            }
            const token = LlmMapper.extractOpenAIStreamToken(line);
            if (token) { fullContent += token; onToken(token); }
        });

        return {
            content: fullContent,
            usage: promptTokens || completionTokens
                ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
                : undefined,
            model,
            provider: this.config.provider,
        };
    }

    private async streamFromAnthropic(
        messages: LLMMessage[],
        model: string,
        onToken: (token: string) => void,
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const systemMsg = messages.find(m => m.role === 'system')?.content ?? '';
        const convMsgs = messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }));

        const response = await this.fetchWithTimeout(this.config.endpoint!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: this.config.maxTokens,
                system: systemMsg,
                messages: convMsgs,
                stream: true,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Anthropic stream error: ${response.statusText} — ${err}`);
        }

        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;

        await this.readSSEStream(response, (line) => {
            const event = LlmMapper.extractAnthropicStreamEvent(line);
            if (!event) return;
            if (event.type === 'content' && event.text) {
                fullContent += event.text;
                onToken(event.text);
            } else if (event.type === 'message_start' && event.inputTokens !== undefined) {
                inputTokens = event.inputTokens;
            } else if (event.type === 'message_delta' && event.outputTokens !== undefined) {
                outputTokens = event.outputTokens;
            }
        });

        return {
            content: fullContent,
            usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens },
            model,
            provider: 'anthropic',
        };
    }

    /**
     * Read an SSE response body and call `onData` for each `data:` line value.
     */
    private async readSSEStream(
        response: Response,
        onData: (dataLine: string) => void,
    ): Promise<void> {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data:')) {
                    onData(trimmed.slice(5).trim());
                }
            }
        }

        if (buffer.trim().startsWith('data:')) {
            onData(buffer.trim().slice(5).trim());
        }
    }
}

// ============================================
// Factory Functions
// ============================================

export function createLlmGateway(options?: LlmGatewayOptions): LlmGateway {
    return new LlmGateway(options);
}

// ── Backward-compat aliases ────────────────────────────────────────────────────
// Keep old names so existing callers (tests, acceptance helpers) still compile
// until the cleanup sweep in Step 8.
export { LlmGateway as LLMController };
export type { LlmGatewayOptions as LLMControllerOptions };

/** @deprecated Use createLlmGateway */
export const createLLMController = createLlmGateway;

export default LlmGateway;
