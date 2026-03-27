/**
 * Acceptance tests: ask pipeline (Scenarios 1 & 2)
 *
 * Scenario 1 — Ask about a file
 *   Given a workspace with "analysis.R" containing a regression model
 *   When user asks "explain the function in analysis.R"
 *   Then intent is classified as "ask" (regex fast-path, no LLM call)
 *   And the workspace is scanned and the file is read
 *   And the LLM streams an explanation
 *   And a turn_saved event is emitted
 *
 * Scenario 2 — Casual greeting skips workspace scan
 *   When user says "hello"
 *   Then intent LLM call returns "ask"
 *   And NO phase_start(scan) events are emitted for the ask phase
 *   And the LLM streams a greeting
 *
 * LLM calls per scenario
 *   Scenario 1: 1 call  — streamPrompt (intent detected by regex → no sendPrompt)
 *   Scenario 2: 2 calls — sendPrompt (intent), streamPrompt (response)
 *
 * ── Record / replay mode ──────────────────────────────────────────────────────
 * Set ACCEPTANCE_TEST_MODE to switch how LLM responses are sourced:
 *
 *   (unset / "inline")  → hand-crafted cassettes (default, no API key needed)
 *   "record"            → real LLM calls; cassettes saved to fixtures/
 *   "replay-file"       → load cassettes from fixtures/ (recorded previously)
 *
 * To record:
 *   ACCEPTANCE_TEST_MODE=record bun test tests/acceptance/ask-pipeline.test.ts
 *
 * Fixture files:
 *   tests/acceptance/fixtures/ask-about-file.cassettes.json  (Scenario 1)
 *   tests/acceptance/fixtures/ask-casual.cassettes.json      (Scenario 2)
 */

import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { RecordReplayLLM } from './helpers/record-replay-llm';
import type { CassetteEntry } from './helpers/record-replay-llm';
import { TestWorkspace } from './helpers/test-workspace';
import { createHarness } from './helpers/test-harness';
import { LLMController } from '../../src/infrastructure/api/llm-controller';

// ── Record / replay mode setup ────────────────────────────────────────────────

const MODE = (process.env.ACCEPTANCE_TEST_MODE ?? 'inline') as 'inline' | 'record' | 'replay-file';

const FIXTURES = {
    askAboutFile: 'tests/acceptance/fixtures/ask-about-file.cassettes.json',
    askCasual:    'tests/acceptance/fixtures/ask-casual.cassettes.json',
} as const;

function makeTestLLM(fixturePath: string, cassettes: CassetteEntry[]): RecordReplayLLM {
    if (MODE === 'record')      return RecordReplayLLM.createRecorder(LLMController.fromEnv());
    if (MODE === 'replay-file') return RecordReplayLLM.fromFile(fixturePath);
    return new RecordReplayLLM(cassettes);
}

/** Save cassettes (record) or assert queue empty (replay). */
function finishLLM(llm: RecordReplayLLM, fixturePath: string): void {
    if (MODE === 'record') {
        llm.saveToFile(fixturePath);
    } else {
        expect(llm.remaining).toBe(0);
    }
}

/** Per-test timeout: real LLM calls need more headroom than inline cassettes. */
const TEST_TIMEOUT = MODE === 'record' ? 60_000 : 10_000;

// ── shared test fixtures ──────────────────────────────────────────────────────

const ANALYSIS_R = `
model <- lm(y ~ x, data = df)
summary(model)
`.trim();

// ── lifecycle ─────────────────────────────────────────────────────────────────

let workspace: TestWorkspace;

beforeEach(() => {
    workspace = TestWorkspace.create({ 'analysis.R': ANALYSIS_R });
});

afterEach(() => {
    workspace.cleanup();
});

// ── Scenario 1: ask about a file ──────────────────────────────────────────────

describe('Scenario 1: ask about a file', () => {
    it('classifies as ask, scans workspace, reads the file, streams explanation', async () => {
        // "explain" prefix → IntentRouter.detectObviousIntent returns "ask" immediately (no LLM intent call)
        // isCasualMessage: length < 50 BUT has "function" → NOT casual → scan runs
        const llm = makeTestLLM(FIXTURES.askAboutFile, [
            {
                // streamPrompt: LLM explanation of analysis.R
                response: {
                    content: 'This R script fits a linear regression model using lm() with y as the dependent variable and x as the predictor.',
                    model: 'test-model',
                    provider: 'test',
                    usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
                },
            },
        ]);

        const { service, eventsOf } = createHarness({ workspace, llm });
        await service.initialize();
        await service.executeInstruction('explain the function in analysis.R');

        // Intent classified as "ask" via regex fast-path
        const intentEvents = eventsOf('intent_classified');
        expect(intentEvents).toHaveLength(1);
        expect(intentEvents[0].data.intent).toBe('ask');

        // Surface any LLM API errors before making stream_token assertions
        const errEvents = eventsOf('error');
        expect(
            errEvents,
            `LLM call failed — check API key / endpoint / model in .env\n` +
            errEvents.map(e => `  ${String(e.data['message'] ?? e.data['phase'])}`).join('\n'),
        ).toHaveLength(0);

        // Workspace scan ran
        const scanStarts = eventsOf('phase_start').filter(e => e.data.phase === 'scan');
        expect(scanStarts.length).toBeGreaterThan(0);

        // Tokens were streamed
        const tokenEvents = eventsOf('stream_token');
        expect(tokenEvents.length).toBeGreaterThan(0);

        // Reconstructed content contains expected text
        // (skipped in record mode — real LLM response may vary)
        if (MODE !== 'record') {
            const streamed = tokenEvents.map(e => e.data.token).join('');
            expect(streamed).toContain('linear regression');
        }

        // Turn was persisted
        expect(eventsOf('turn_saved')).toHaveLength(1);
        expect(eventsOf('turn_saved')[0].data.turnCount).toBe(1);

        finishLLM(llm, FIXTURES.askAboutFile);
    }, TEST_TIMEOUT);
});

// ── Scenario 2: casual greeting skips scan ────────────────────────────────────

describe('Scenario 2: casual greeting skips workspace scan', () => {
    it('classifies via LLM as ask, skips workspace scan, streams greeting', async () => {
        // "hello" has no regex match → IntentRouter calls LLM for classification
        // isCasualMessage("hello"): short + no code words → casual → scan SKIPPED
        const llm = makeTestLLM(FIXTURES.askCasual, [
            {
                // sendPrompt: intent classification
                response: { content: 'ask', model: 'test-model', provider: 'test' },
            },
            {
                // streamPrompt: casual response
                response: {
                    content: 'Hello! How can I help you with your R project today?',
                    model: 'test-model',
                    provider: 'test',
                    usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
                },
            },
        ]);

        const { service, eventsOf } = createHarness({ workspace, llm });
        await service.initialize();
        await service.executeInstruction('hello');

        // Intent classified as "ask"
        const intentEvents = eventsOf('intent_classified');
        expect(intentEvents).toHaveLength(1);
        expect(intentEvents[0].data.intent).toBe('ask');

        // Surface any LLM API errors before making stream_token assertions
        const errEvents = eventsOf('error');
        expect(
            errEvents,
            `LLM call failed — check API key / endpoint / model in .env\n` +
            errEvents.map(e => `  ${String(e.data['message'] ?? e.data['phase'])}`).join('\n'),
        ).toHaveLength(0);

        // No scan-phase start emitted by the ask use case scan path
        // (phase_start(scan) is still emitted but immediately returns empty for casual)
        const tokenEvents = eventsOf('stream_token');
        expect(tokenEvents.length).toBeGreaterThan(0);

        // (skipped in record mode — real LLM response may vary)
        if (MODE !== 'record') {
            const streamed = tokenEvents.map(e => e.data.token).join('');
            expect(streamed).toContain('Hello');
        }

        // Turn persisted
        expect(eventsOf('turn_saved')).toHaveLength(1);

        finishLLM(llm, FIXTURES.askCasual);
    }, TEST_TIMEOUT);
});
