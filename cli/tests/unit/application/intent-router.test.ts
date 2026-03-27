/**
 * Unit Tests: IntentRouter
 *
 * Tests both the deterministic regex pre-check (detectObviousIntent) and
 * the LLM-based classification path, with no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { IntentRouter, Intent } from '../../../src/application/services/intent-router';
import { LLMController } from '../../../src/infrastructure/api/llm-controller';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLLM(response = 'ask'): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content: response }),
        streamPrompt: vi.fn(),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'test', provider: 'test' }),
    } as unknown as LLMController;
}

function makeRouter(llmResponse = 'ask') {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const llm = makeMockLLM(llmResponse);
    const router = new IntentRouter(llm, (type, data) => events.push({ type, data }));
    return { router, events, llm };
}

// ── detectObviousIntent (static, no LLM) ─────────────────────────────────────

describe('IntentRouter.detectObviousIntent()', () => {
    it.each<[string, Intent]>([
        ['What does this function do?', 'ask'],
        ['how does R handle vectors?', 'ask'],
        ['explain the regression model', 'ask'],
        ["what's the difference between lm and glm?", 'ask'],
    ])('classifies "%s" as ask', (instruction, expected) => {
        expect(IntentRouter.detectObviousIntent(instruction)).toBe(expected);
    });

    it.each<[string, Intent]>([
        ['install ggplot2', 'install'],
        ['install dplyr', 'install'],
    ])('classifies "%s" as install', (instruction, expected) => {
        expect(IntentRouter.detectObviousIntent(instruction)).toBe(expected);
    });

    it.each<[string, Intent]>([
        ['run hw11.R', 'run'],
        ['execute analysis.Rmd', 'run'],
        ['C:/Users/Mindy/Desktop/hw5.R', 'run'],
        ['/home/user/project/script.Rmd', 'run'],
    ])('classifies "%s" as run', (instruction, expected) => {
        expect(IntentRouter.detectObviousIntent(instruction)).toBe(expected);
    });

    it('returns null for ambiguous instructions', () => {
        expect(IntentRouter.detectObviousIntent('fix the regression function')).toBeNull();
        expect(IntentRouter.detectObviousIntent('add error handling')).toBeNull();
    });
});

// ── classify() — deterministic fast path ─────────────────────────────────────

describe('IntentRouter.classify() — fast path', () => {
    it('returns ask without calling LLM when instruction ends with "?"', async () => {
        const { router, llm } = makeRouter();
        const intent = await router.classify('What is this?', []);
        expect(intent).toBe('ask');
        expect(llm.sendPrompt).not.toHaveBeenCalled();
    });

    it('returns install without calling LLM for "install X"', async () => {
        const { router, llm } = makeRouter();
        const intent = await router.classify('install tidyverse', []);
        expect(intent).toBe('install');
        expect(llm.sendPrompt).not.toHaveBeenCalled();
    });

    it('returns run without calling LLM for explicit run + .R', async () => {
        const { router, llm } = makeRouter();
        const intent = await router.classify('run hw11.R', []);
        expect(intent).toBe('run');
        expect(llm.sendPrompt).not.toHaveBeenCalled();
    });

    it('emits intent_classified with the detected intent', async () => {
        const { router, events } = makeRouter();
        await router.classify('What is this?', []);
        const evt = events.find(e => e.type === 'intent_classified');
        expect(evt?.data.intent).toBe('ask');
    });

    it('emits phase_start and phase_end for intent phase', async () => {
        const { router, events } = makeRouter();
        await router.classify('What is this?', []);
        expect(events.find(e => e.type === 'phase_start' && e.data.phase === 'intent')).toBeDefined();
        expect(events.find(e => e.type === 'phase_end'  && e.data.phase === 'intent')).toBeDefined();
    });
});

// ── classify() — LLM fallback path ───────────────────────────────────────────

describe('IntentRouter.classify() — LLM fallback', () => {
    it.each<[string, Intent]>([
        ['edit',    'edit'],
        ['run',     'run'],
        ['install', 'install'],
        ['ask',     'ask'],
        ['unknown', 'ask'],  // unexpected response defaults to 'ask'
    ])('maps LLM response "%s" to intent %s', async (llmResponse, expected) => {
        const { router } = makeRouter(llmResponse);
        const intent = await router.classify('fix the regression model', []);
        expect(intent).toBe(expected);
    });

    it('calls LLM sendPrompt for ambiguous instruction', async () => {
        const { router, llm } = makeRouter('edit');
        await router.classify('refactor analysis.R', []);
        expect(llm.sendPrompt).toHaveBeenCalledTimes(1);
    });

    it('defaults to ask and emits warning when LLM throws', async () => {
        const events: Array<{ type: string; data: Record<string, unknown> }> = [];
        const llm = {
            sendPrompt: vi.fn().mockRejectedValue(new Error('network error')),
        } as unknown as LLMController;
        const router = new IntentRouter(llm, (type, data) => events.push({ type, data }));

        const intent = await router.classify('refactor something', []);

        expect(intent).toBe('ask');
        const warning = events.find(
            e => e.type === 'status_update' && String(e.data.warning ?? '').includes('Intent classification failed'),
        );
        expect(warning).toBeDefined();
    });
});
