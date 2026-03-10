/**
 * Controller: LLM Controller
 *
 * Handles communication with LLM APIs (OpenAI, Anthropic, etc.)
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

import { GeneratedPrompt } from '../../shared/types/prompt-context';
import { LLMRequestPayload } from '../../shared/types/llm-types';
import { LLMConfig, getLLMConfigFromEnv, LLMProvider } from '../config';
import { LLM } from '../config/constants';
import { SessionLogger } from './session-logger';

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

export type { LLMRequestPayload as LLMRequest } from '../../shared/types/llm-types';

export interface LLMResponse {
    /** LLM's response content */
    content: string;
    /** Token usage information */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    /** Model used for response */
    model: string;
    /** Provider used */
    provider: LLMProvider;
    /** Response time in ms */
    responseTimeMs?: number;
}

export interface LLMControllerOptions {
    /** Override config from environment */
    config?: Partial<LLMConfig>;
    /** Enable retry on failure */
    enableRetry?: boolean;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Session ID for analytics */
    sessionId?: string;
}

// Internal types for API responses
interface OpenAIResponse {
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
    error?: { message?: string };
}

interface AnthropicResponse {
    content: Array<{ text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
    model: string;
    error?: { message?: string };
}

// ============================================
// LLM Controller
// ============================================

export class LLMController {
    private config: LLMConfig;
    private enableRetry: boolean;
    private maxRetries: number;
    private sessionLogger: SessionLogger;
    public readonly sessionId: string;

    /**
     * Create an LLM Controller
     * 
     * @example
     * // Use environment configuration (recommended)
     * const controller = LLMController.fromEnv();
     * 
     * // Or with custom options
     * const controller = new LLMController({
     *     config: { model: 'gpt-3.5-turbo' }
     * });
     */
    constructor(options: LLMControllerOptions = {}) {
        // Load config from environment, allow overrides
        const envConfig = getLLMConfigFromEnv();
        this.config = {
            ...envConfig,
            ...options.config,
        };
        this.enableRetry = options.enableRetry ?? true;
        this.maxRetries = options.maxRetries ?? 3;
        this.sessionLogger = new SessionLogger();
        this.sessionId = options.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Factory method: Create controller from environment variables
     */
    static fromEnv(sessionId?: string): LLMController {
        return new LLMController({ sessionId });
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
        this.sessionLogger.log({
            sessionId: this.sessionId,
            prompt: request.userMessage,
            response: fullResult.content,
            responseTimeMs: fullResult.responseTimeMs,
            provider: fullResult.provider,
            model: fullResult.model,
        }).catch(() => { });

        return fullResult;
    }

    // ============================================
    // Validation
    // ============================================

    /**
     * Validate request parameters before sending to API
     */
    private validateRequest(request: LLMRequestPayload): void {
        // Validate system prompt
        if (!request.systemPrompt?.trim()) {
            throw new LLMValidationError('System prompt is required and cannot be empty');
        }

        if (request.systemPrompt.length > LLM.MAX_SYSTEM_PROMPT_LENGTH) {
            throw new LLMValidationError(
                `System prompt exceeds maximum length of ${LLM.MAX_SYSTEM_PROMPT_LENGTH} characters`
            );
        }

        // Validate user message
        if (!request.userMessage?.trim()) {
            throw new LLMValidationError('User message is required and cannot be empty');
        }

        if (request.userMessage.length > LLM.MAX_USER_MESSAGE_LENGTH) {
            throw new LLMValidationError(
                `User message exceeds maximum length of ${LLM.MAX_USER_MESSAGE_LENGTH} characters`
            );
        }

        // Validate history messages if present
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
     * Convenience method: Send with GeneratedPrompt from context-builder
     */
    async sendWithContext(
        generatedPrompt: GeneratedPrompt,
        userMessage: string,
        history?: { role: 'user' | 'assistant'; content: string }[]
    ): Promise<LLMResponse> {
        return this.sendPrompt({
            systemPrompt: generatedPrompt.systemPrompt,
            userMessage,
            history,
        });
    }

    /**
     * Analyze R code with environment context
     */
    async analyzeCode(
        generatedPrompt: GeneratedPrompt,
        rCode: string
    ): Promise<LLMResponse> {
        const userMessage = `Please analyze the following R code:\n\n\`\`\`r\n${rCode}\n\`\`\``;
        return this.sendWithContext(generatedPrompt, userMessage);
    }

    /**
     * Phase 1 of agent workflow: ask the LLM which files are relevant.
     * Returns matched file paths + raw usage for token tracking.
     */
    async resolveFiles(
        instruction: string,
        previews: Array<{ path: string; content: string }>,
        history?: { role: 'user' | 'assistant'; content: string }[],
    ): Promise<{ targets: string[]; usage?: LLMResponse['usage'] }> {
        const fileList = previews.map(p => `- ${p.path}`).join('\n');
        const response = await this.sendPrompt({
            systemPrompt:
                'You are a file relevance analyzer. Given a list of file paths and a user instruction, ' +
                'return ONLY a JSON array of the most relevant file paths (strings). No explanation.',
            userMessage:
                `Instruction: ${instruction}\n\nFiles:\n${fileList}\n\n` +
                'Return a JSON array of relevant file paths.',
            history,
        });

        let targets: string[] = [];
        try {
            const match = response.content.match(/\[[\s\S]*?\]/);
            if (match) targets = JSON.parse(match[0]) as string[];
        } catch {
            targets = previews.slice(0, 5).map(p => p.path);
        }
        return { targets, usage: response.usage };
    }

    /**
     * Phase 2 of agent workflow: ask the LLM to edit target files.
     * Returns modified file contents + raw usage for token tracking.
     */
    async editFiles(
        instruction: string,
        fileContexts: Array<{ path: string; content: string }>,
        history?: { role: 'user' | 'assistant'; content: string }[],
    ): Promise<{ files: Array<{ path: string; content: string }>; usage?: LLMResponse['usage'] }> {
        const filesJson = JSON.stringify(fileContexts);
        const response = await this.sendPrompt({
            systemPrompt:
                'You are a code editor. Given file contents and a user instruction, ' +
                'return ONLY a JSON array: [{"path":"...","content":"..."}]. ' +
                'Preserve formatting. No markdown fences around the JSON.',
            userMessage: `Instruction: ${instruction}\n\nFiles:\n${filesJson}`,
            history,
        });

        let files: Array<{ path: string; content: string }> = [];
        try {
            const match = response.content.match(/\[[\s\S]*\]/);
            if (match) files = JSON.parse(match[0]) as Array<{ path: string; content: string }>;
        } catch {
            files = [];
        }
        return { files, usage: response.usage };
    }

    /**
     * Get current provider info (safe to log, no secrets)
     */
    getProviderInfo(): { provider: LLMProvider; model: string; endpoint: string } {
        return {
            provider: this.config.provider,
            model: this.config.model,
            endpoint: this.config.endpoint || '',
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
            const errorData = await response.json() as OpenAIResponse;
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json() as OpenAIResponse;

        return {
            content: data.choices[0]?.message?.content || '',
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
            model: data.model,
            provider: 'openai',
        };
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
            const errorData = await response.json() as AnthropicResponse;
            throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json() as AnthropicResponse;

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

    private async sendToAzure(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        // Azure OpenAI uses a different endpoint format
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
            const errorData = await response.json() as OpenAIResponse;
            throw new Error(`Azure OpenAI error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json() as OpenAIResponse;

        return {
            content: data.choices[0]?.message?.content || '',
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
            model: model,
            provider: 'azure',
        };
    }

    private async sendToOllama(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        // Ollama uses a different format
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

        return {
            content: data.message?.content || '',
            model,
            provider: 'ollama',
        };
    }

    private async sendToGoogle(
        messages: LLMMessage[],
        model: string
    ): Promise<Omit<LLMResponse, 'responseTimeMs'>> {
        const url = `${this.config.endpoint}/${model}:generateContent?key=${this.config.apiKey}`;

        let systemPrompt = '';
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage) {
            systemPrompt = systemMessage.content;
        }

        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

        const body: any = {
            contents,
            generationConfig: {
                maxOutputTokens: this.config.maxTokens,
            }
        };

        if (systemPrompt) {
            body.systemInstruction = {
                parts: [{ text: systemPrompt }]
            };
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

        const data = await response.json() as any;
        const outText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        let usage;
        if (data.usageMetadata) {
            usage = {
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            };
        }

        return {
            content: outText,
            usage,
            model,
            provider: 'google',
        };
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

            // Exponential backoff
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
            // Unsupported providers: fall back to non-streaming
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
            if (line === '[DONE]') return;
            try {
                const data = JSON.parse(line) as {
                    choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
                    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
                };
                const token = data.choices?.[0]?.delta?.content ?? '';
                if (token) { fullContent += token; onToken(token); }
                if (data.usage) {
                    promptTokens = data.usage.prompt_tokens;
                    completionTokens = data.usage.completion_tokens;
                }
            } catch { /* skip malformed lines */ }
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
            try {
                const data = JSON.parse(line) as {
                    type?: string;
                    delta?: { type?: string; text?: string };
                    usage?: { input_tokens?: number; output_tokens?: number };
                    message?: { usage?: { input_tokens: number; output_tokens: number } };
                };
                if (data.type === 'content_block_delta' && data.delta?.text) {
                    fullContent += data.delta.text;
                    onToken(data.delta.text);
                }
                if (data.type === 'message_start' && data.message?.usage) {
                    inputTokens = data.message.usage.input_tokens;
                }
                if (data.type === 'message_delta' && data.usage) {
                    outputTokens = data.usage.output_tokens ?? 0;
                }
            } catch { /* skip malformed lines */ }
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
            buffer = lines.pop() ?? '';  // keep incomplete last line

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data:')) {
                    onData(trimmed.slice(5).trim());
                }
            }
        }

        // Flush remaining buffer
        if (buffer.trim().startsWith('data:')) {
            onData(buffer.trim().slice(5).trim());
        }
    }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create controller from environment (recommended)
 */
export function createLLMController(options?: LLMControllerOptions): LLMController {
    return new LLMController(options);
}

export default LLMController;
