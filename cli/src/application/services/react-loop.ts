/**
 * Service: ReActLoop
 *
 * Implements the Reasoning + Acting (ReAct) pattern for the agent harness.
 *
 * Marker format (documented in system prompt):
 *   [THOUGHT] <reasoning text>
 *   [ACTION {"tool":"name","input":{...}}]
 *   -- or --
 *   [THOUGHT] <reasoning text>
 *   [ANSWER] <final answer to return>
 *
 * The loop runs up to maxSteps iterations. Each step:
 *   1. Calls the LLM with current workingMessages
 *   2. Parses the response for [ACTION] or [ANSWER]
 *   3. If [ACTION]: executes the tool, appends [OBSERVATION], continues
 *   4. If [ANSWER]: returns the result
 *
 * workingMessages is an ephemeral ReAct scratchpad — never persisted to session.
 */

import { LLMController } from '../../infrastructure/api/llm-controller';
import { LLMRequestPayload } from '../../shared/types/llm-types';
import { ToolRegistry } from './tool-registry';
import { TurnUsage } from '../../domain/entities/conversation-turn';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReActStep {
    stepNumber: number;
    thought?: string;
    action?: { tool: string; input: Record<string, unknown> };
    observation?: string;
    answer?: string;
    isError?: boolean;
}

export interface ReActResult {
    /** Final answer text from [ANSWER] marker (or last LLM response on timeout) */
    result: string;
    /** All steps taken during this loop run */
    steps: ReActStep[];
    /** Cumulative token usage across all LLM calls in this run */
    usage: TurnUsage;
}

// ── System prompt appendix ────────────────────────────────────────────────────

const REACT_FORMAT_INSTRUCTIONS = `
## ReAct Format Instructions

Think step by step. On each response use EXACTLY ONE of these formats:

Format A — when you need to use a tool:
[THOUGHT] <your reasoning here>
[ACTION {"tool":"<tool_name>","input":{<parameters>}}]

Format B — when you have the final answer:
[THOUGHT] <your reasoning here>
[ANSWER] <your complete answer here>

After a tool call you will receive:
[OBSERVATION] <tool output>

Rules:
- Always start with [THOUGHT]
- Use [ACTION] to call tools, [ANSWER] to finish
- Never include markdown fences around the markers
- [ANSWER] ends the loop immediately`.trim();

// ── ReActLoop ─────────────────────────────────────────────────────────────────

export class ReActLoop {
    constructor(
        private readonly llm: LLMController,
        private readonly registry: ToolRegistry,
    ) { }

    async run(
        baseRequest: LLMRequestPayload,
        maxSteps = 10,
    ): Promise<ReActResult> {
        // Inject format instructions into system prompt
        const systemPrompt = baseRequest.systemPrompt + '\n\n' + REACT_FORMAT_INSTRUCTIONS;

        // workingMessages is ephemeral — starts from baseRequest.history
        const workingMessages: { role: 'user' | 'assistant'; content: string }[] = [
            ...(baseRequest.history ?? []),
        ];

        const steps: ReActStep[] = [];
        const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, responseTimeMs: 0 };
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;

        for (let step = 1; step <= maxSteps; step++) {
            const stepRecord: ReActStep = { stepNumber: step };
            steps.push(stepRecord);

            // Build request for this step
            const stepRequest: LLMRequestPayload = {
                systemPrompt,
                userMessage: baseRequest.userMessage,
                history: workingMessages,
                model: baseRequest.model,
            };

            // Call LLM
            let rawResponse: string;
            try {
                const response = await this.llm.sendPrompt(stepRequest);
                rawResponse = response.content;
                // Accumulate usage
                if (response.usage) {
                    usage.inputTokens += response.usage.promptTokens ?? 0;
                    usage.outputTokens += response.usage.completionTokens ?? 0;
                }
                if (response.responseTimeMs) {
                    usage.responseTimeMs = (usage.responseTimeMs ?? 0) + response.responseTimeMs;
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                stepRecord.isError = true;
                stepRecord.answer = `LLM call failed: ${msg}`;
                return { result: stepRecord.answer, steps, usage };
            }

            // Parse response
            const parsed = parseReActResponse(rawResponse);
            stepRecord.thought = parsed.thought;

            if (parsed.answer !== undefined) {
                stepRecord.answer = parsed.answer;
                return { result: parsed.answer, steps, usage };
            }

            if (parsed.action) {
                stepRecord.action = parsed.action;

                // Execute the tool
                const toolResult = await this.registry.execute(
                    parsed.action.tool,
                    parsed.action.input,
                );
                const observation = toolResult.content;
                stepRecord.observation = observation;

                // Track consecutive errors — abort if stuck in a failure loop
                if (toolResult.isError) {
                    consecutiveErrors++;
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        stepRecord.isError = true;
                        stepRecord.answer = `Aborting: ${consecutiveErrors} consecutive tool errors. Last error: ${observation}`;
                        return { result: stepRecord.answer, steps, usage };
                    }
                } else {
                    consecutiveErrors = 0;
                }

                // Append to workingMessages as assistant + observation user turn
                workingMessages.push({ role: 'assistant', content: rawResponse });
                workingMessages.push({ role: 'user', content: `[OBSERVATION] ${observation}` });
                continue;
            }

            // Response had neither [ACTION] nor [ANSWER] — treat as final answer
            stepRecord.answer = rawResponse;
            return { result: rawResponse, steps, usage };
        }

        // maxSteps exhausted — return last raw thought as answer
        const last = steps.at(-1);
        const result = last?.thought ?? 'Maximum steps reached without a final answer.';
        return { result, steps, usage };
    }
}

// ── Parser ────────────────────────────────────────────────────────────────────

interface ParsedResponse {
    thought?: string;
    action?: { tool: string; input: Record<string, unknown> };
    answer?: string;
}

function parseReActResponse(raw: string): ParsedResponse {
    const thoughtMatch = raw.match(/\[THOUGHT\]\s*([\s\S]*?)(?=\[ACTION|\[ANSWER|$)/);
    const thought = thoughtMatch?.[1]?.trim();

    // Try [ANSWER]
    const answerMatch = raw.match(/\[ANSWER\]\s*([\s\S]+)/);
    if (answerMatch) {
        return { thought, answer: answerMatch[1].trim() };
    }

    // Try [ACTION {...}]
    const actionMatch = raw.match(/\[ACTION\s+(\{[\s\S]*?\})\]/);
    if (actionMatch) {
        try {
            const parsed = JSON.parse(actionMatch[1]) as { tool: string; input: Record<string, unknown> };
            if (parsed.tool) {
                return { thought, action: { tool: parsed.tool, input: parsed.input ?? {} } };
            }
        } catch {
            // JSON parse failed — fall through to treat as answer
        }
    }

    return { thought, answer: raw.trim() };
}
