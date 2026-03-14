/**
 * Unit Tests: Evaluator
 */

import { describe, it, expect, vi } from 'vitest';
import { Evaluator } from '../src/application/services/evaluator';
import { LLMController } from '../src/infrastructure/api/llm-controller';
import { LLMRequestPayload } from '../src/shared/types/llm-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(responseContent: string): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content: responseContent }),
        getProviderInfo: vi.fn(),
        streamPrompt: vi.fn(),
    } as unknown as LLMController;
}

const BASE_REQUEST: LLMRequestPayload = {
    systemPrompt: 'system',
    userMessage: 'user',
    history: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Evaluator', () => {
    describe('validateEditOutput()', () => {
        it('accepts a valid edit array', () => {
            const evaluator = new Evaluator();
            const output = JSON.stringify([{ path: 'hello.R', content: 'x <- 1' }]);

            const result = evaluator.validateEditOutput(output);

            expect(result.valid).toBe(true);
            expect(result.artifacts).toHaveLength(1);
            expect(result.artifacts![0].path).toBe('hello.R');
            expect(result.artifacts![0].content).toBe('x <- 1');
        });

        it('accepts a valid array embedded in surrounding text', () => {
            const evaluator = new Evaluator();
            const output = 'Here are the edits:\n[{"path":"a.R","content":"1"}]\nDone.';

            const result = evaluator.validateEditOutput(output);

            expect(result.valid).toBe(true);
        });

        it('rejects output with no JSON array', () => {
            const evaluator = new Evaluator();
            const result = evaluator.validateEditOutput('Just plain text, no array.');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No JSON array');
        });

        it('rejects malformed JSON', () => {
            const evaluator = new Evaluator();
            const result = evaluator.validateEditOutput('[{path: "bad json"}]');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('JSON parse error');
        });

        it('rejects when array items are missing required fields', () => {
            const evaluator = new Evaluator();
            const result = evaluator.validateEditOutput('[{"path": "only-path.R"}]');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('path: string');
        });

        it('rejects a non-array JSON value', () => {
            const evaluator = new Evaluator();
            const result = evaluator.validateEditOutput('{"path":"x.R","content":"y"}');

            // The regex grabs [...] — this is an object, no array match → different error path
            expect(result.valid).toBe(false);
        });

        it('accepts an empty array', () => {
            const evaluator = new Evaluator();
            const result = evaluator.validateEditOutput('[]');

            expect(result.valid).toBe(true);
            expect(result.artifacts).toHaveLength(0);
        });
    });

    describe('validateTextOutput()', () => {
        it('accepts non-empty output', () => {
            const evaluator = new Evaluator();
            expect(evaluator.validateTextOutput('Some analysis').valid).toBe(true);
        });

        it('rejects empty string', () => {
            const evaluator = new Evaluator();
            expect(evaluator.validateTextOutput('').valid).toBe(false);
        });

        it('rejects whitespace-only string', () => {
            const evaluator = new Evaluator();
            expect(evaluator.validateTextOutput('   \n  ').valid).toBe(false);
        });
    });

    describe('retryWithCorrection()', () => {
        it('returns corrected output when LLM fixes the format on first retry', async () => {
            const corrected = JSON.stringify([{ path: 'fixed.R', content: 'x <- 2' }]);
            const llm = makeMockLLM(corrected);
            const evaluator = new Evaluator();

            const result = await evaluator.retryWithCorrection(llm, BASE_REQUEST, 'invalid output');

            expect(result).toBe(corrected);
            expect(llm.sendPrompt).toHaveBeenCalledOnce();
        });

        it('returns last attempt if retries are exhausted', async () => {
            const llm = makeMockLLM('still invalid');
            const evaluator = new Evaluator();

            const result = await evaluator.retryWithCorrection(llm, BASE_REQUEST, 'invalid', 2);

            // Called twice (maxRetries = 2), still got the last bad response
            expect(llm.sendPrompt).toHaveBeenCalledTimes(2);
            expect(result).toBe('still invalid');
        });

        it('stops early and returns current output when LLM call throws', async () => {
            const llm = {
                sendPrompt: vi.fn().mockRejectedValue(new Error('network error')),
            } as unknown as LLMController;
            const evaluator = new Evaluator();

            const result = await evaluator.retryWithCorrection(llm, BASE_REQUEST, 'original bad output');

            // Should have tried once then stopped
            expect(llm.sendPrompt).toHaveBeenCalledOnce();
            expect(result).toBe('original bad output');
        });
    });
});
