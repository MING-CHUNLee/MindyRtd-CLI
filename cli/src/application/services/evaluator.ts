/**
 * Service: Evaluator
 *
 * Implements the Evaluator node from the architecture diagram's Feedback Loop:
 *   Evaluator → LLM Reasoning → Tool Router → Evaluator
 *
 * Responsibilities:
 *   1. Output Validation  — verify LLM output matches expected schema
 *   2. Auto-Retry         — if validation fails, re-prompt LLM to correct its output
 *   3. Error-to-Obs       — (structural guarantee upheld by ToolRegistry.execute())
 *
 * Usage: call validateEditOutput() after Orchestrator.extractArtifacts().
 * If invalid, call retryWithCorrection() to get a second chance before giving up.
 */

import { LLMController } from '../../infrastructure/api/llm-controller';
import { LLMRequestPayload } from '../../shared/types/llm-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EditArtifact {
    path: string;
    content: string;
}

export interface ValidationResult {
    valid: boolean;
    artifacts?: EditArtifact[];
    error?: string;
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

export class Evaluator {
    /**
     * Validate that a string contains a well-formed edit-array:
     *   [{"path": "...", "content": "..."}]
     */
    validateEditOutput(output: string): ValidationResult {
        const match = output.match(/\[[\s\S]*\]/);
        if (!match) {
            return { valid: false, error: 'No JSON array found in output' };
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(match[0]);
        } catch (e) {
            return { valid: false, error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
        }

        if (!Array.isArray(parsed)) {
            return { valid: false, error: 'Parsed value is not an array' };
        }

        for (const item of parsed as unknown[]) {
            if (
                typeof item !== 'object' || item === null ||
                typeof (item as Record<string, unknown>).path !== 'string' ||
                typeof (item as Record<string, unknown>).content !== 'string'
            ) {
                return {
                    valid: false,
                    error: 'Each array item must have { path: string; content: string }',
                };
            }
        }

        return { valid: true, artifacts: parsed as EditArtifact[] };
    }

    /**
     * If LLM output failed validation, re-prompt it to correct the format.
     * Returns the corrected output string (or the last attempt if still invalid).
     *
     * Uses a dedicated correction system prompt that does NOT re-run tools —
     * this is a pure format-correction pass, not a new reasoning step.
     */
    async retryWithCorrection(
        llm: LLMController,
        originalRequest: LLMRequestPayload,
        invalidOutput: string,
        maxRetries = 2,
    ): Promise<string> {
        let output = invalidOutput;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const validationError = this.validateEditOutput(output).error ?? 'unknown error';

            const correctionRequest: LLMRequestPayload = {
                systemPrompt:
                    'You are a JSON formatter. The previous response was not valid. ' +
                    'Return ONLY a valid JSON array: [{"path":"...","content":"..."}]. ' +
                    'No markdown fences, no explanation.',
                userMessage:
                    `Validation error: ${validationError}\n\n` +
                    `Previous (invalid) response:\n${output}\n\n` +
                    'Fix it and return ONLY the corrected JSON array.',
                history: [
                    ...(originalRequest.history ?? []),
                    { role: 'user', content: originalRequest.userMessage },
                    { role: 'assistant', content: output },
                ],
                model: originalRequest.model,
            };

            try {
                const response = await llm.sendPrompt(correctionRequest);
                output = response.content;
            } catch {
                break; // LLM call failed — return what we have
            }

            if (this.validateEditOutput(output).valid) return output;
        }

        return output;
    }

    /**
     * Validate a single text output (non-JSON).
     * Currently just checks it is non-empty.
     */
    validateTextOutput(output: string): ValidationResult {
        if (!output?.trim()) {
            return { valid: false, error: 'Empty output' };
        }
        return { valid: true };
    }
}
