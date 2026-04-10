/**
 * Domain Interface: LLMGateway
 *
 * Contract that any LLM provider must satisfy.
 * Application use cases and services depend on this interface, never on
 * the concrete LlmGateway class directly.
 * Infrastructure layer provides the concrete implementation (LlmGateway).
 */

import { LLMRequestPayload, LLMResponse } from '../../shared/types/llm-types';

export interface LLMGateway {
    readonly sessionId: string;
    sendPrompt(request: LLMRequestPayload): Promise<LLMResponse>;
    streamPrompt(request: LLMRequestPayload, onToken: (token: string) => void): Promise<LLMResponse>;
    getProviderInfo(): { provider: string; model: string; endpoint?: string };
}
