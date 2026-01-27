/**
 * Controllers Module
 * 
 * Exports all API controllers for external service communication.
 * 
 * Controllers follow the Gateway/Adapter pattern:
 * - Abstract away external API details
 * - Services use controllers without knowing API specifics
 * - Easy to swap providers (OpenAI → Anthropic) via environment variables
 * 
 * Reference Projects:
 * - LangChain.js: Provider abstraction pattern
 * - Vercel AI SDK: Unified interface for multiple providers
 */

export {
    LLMController,
    LLMMessage,
    LLMRequest,
    LLMResponse,
    LLMControllerOptions,
    createLLMController,
} from './llm-controller';
