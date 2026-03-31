/**
 * API Module
 *
 * Two sub-modules:
 *   llm/     — LLM provider gateway (OpenAI, Anthropic, Azure, Gemini, Ollama)
 *   logging/ — Analytics/logging backends (SessionLogger, RubyLogClient)
 */

export {
    LLMController,
    LLMMessage,
    LLMRequest,
    LLMResponse,
    LLMControllerOptions,
    LLMValidationError,
    LLMAPIError,
    createLLMController,
} from './llm';

export { SessionLogger, LogPayload } from './logging';
export { RubyLogClient, LogEvent, SessionSummary } from './logging';
