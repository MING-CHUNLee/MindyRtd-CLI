/**
 * Domain Interface: LLMGateway
 *
 * Contract that any LLM provider must satisfy.
 * AgentService and use cases depend on this interface, never on LLMController directly.
 * Infrastructure layer provides the concrete implementation (LLMController).
 */

import { LLMRequestPayload, LLMResponse } from '../../shared/types/llm-types';

export interface LLMGateway {
    sendPrompt(request: LLMRequestPayload): Promise<LLMResponse>;
    streamPrompt(request: LLMRequestPayload, onToken: (token: string) => void): Promise<LLMResponse>;
    getProviderInfo(): { provider: string; model: string };
}
