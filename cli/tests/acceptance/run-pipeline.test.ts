/**
 * Acceptance tests: run pipeline (Scenario 4)
 *
 * Scenario 4 — Execute an R script and analyze the output
 *   Given a workspace with "hw5.R" containing `print(1 + 1)`
 *   When user runs "execute hw5.R and analyze"
 *   Then intent is classified as "run" (regex fast-path — no LLM intent call)
 *   And phase_start(scan) discovers hw5.R
 *   And phase_start(run) executes via r_exec (mocked → returns "[1] 2")
 *   And phase_start(analyze) streams an LLM analysis of the output
 *   And a text_output event contains the analysis
 *
 * LLM calls: 1  — streamPrompt for the analysis
 *   Intent detected by regex ("execute" + ".R" → "run") — no sendPrompt.
 *   r_exec is replaced with a fake AgentTool so no real R installation is required.
 *
 * Why ExecuteRunUseCase directly (not AgentService):
 *   AgentService registers tools in its constructor with no injection point for
 *   the registry.  Using the use case directly lets us swap r_exec without
 *   modifying production code, while still exercising the full run pipeline:
 *   scan → find script → read source → exec → analyze.
 *
 * ── Record / replay mode ──────────────────────────────────────────────────────
 * Set ACCEPTANCE_TEST_MODE to switch how LLM responses are sourced:
 *
 *   (unset / "inline")  → hand-crafted cassettes (default, no API key needed)
 *   "record"            → real LLM calls; cassettes saved to fixtures/
 *   "replay-file"       → load cassettes from fixtures/ (recorded previously)
 *
 * To record:
 *   ACCEPTANCE_TEST_MODE=record bun test tests/acceptance/run-pipeline.test.ts
 *
 * Fixture file:
 *   tests/acceptance/fixtures/run-analyze.cassettes.json
 */

import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { RecordReplayLLM } from './helpers/record-replay-llm';
import type { CassetteEntry } from './helpers/record-replay-llm';
import { TestWorkspace } from './helpers/test-workspace';
import { ExecuteRunUseCase } from '../../src/application/use-cases/execute-run-use-case';
import { ToolRegistry } from '../../src/application/orchestration/tool-registry';
import { FileScanTool } from '../../src/application/tools/file-scan-tool';
import { DirectoryScanner } from '../../src/infrastructure/filesystem/directory-scanner';
import { LLMController } from '../../src/infrastructure/api/llm-controller';
import type { AgentTool, ToolResult } from '../../src/domain/interfaces/agent-tool';

// ── Record / replay mode setup ────────────────────────────────────────────────

const MODE = (process.env.ACCEPTANCE_TEST_MODE ?? 'inline') as 'inline' | 'record' | 'replay-file';

const FIXTURE_PATH = 'tests/acceptance/fixtures/run-analyze.cassettes.json';

function makeTestLLM(cassettes: CassetteEntry[]): RecordReplayLLM {
    if (MODE === 'record')      return RecordReplayLLM.createRecorder(LLMController.fromEnv());
    if (MODE === 'replay-file') return RecordReplayLLM.fromFile(FIXTURE_PATH);
    return new RecordReplayLLM(cassettes);
}

/** Save cassettes (record) or assert queue empty (replay). */
function finishLLM(llm: RecordReplayLLM): void {
    if (MODE === 'record') {
        llm.saveToFile(FIXTURE_PATH);
    } else {
        expect(llm.remaining).toBe(0);
    }
}

const TEST_TIMEOUT = MODE === 'record' ? 60_000 : 10_000;

// ── fake r_exec tool ──────────────────────────────────────────────────────────

function makeFakeRExec(output: string): AgentTool {
    return {
        name: 'r_exec',
        schema: {
            name: 'r_exec',
            description: 'Execute R code',
            parameters: {
                code: { type: 'string', required: true, description: 'R code to execute' },
            },
        },
        execute: async (_input): Promise<ToolResult> => ({
            content: output,
            isError: false,
        }),
    };
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

let workspace: TestWorkspace;

beforeEach(() => {
    workspace = TestWorkspace.create({ 'hw5.R': 'print(1 + 1)\n' });
});

afterEach(() => {
    workspace.cleanup();
});

// ── Scenario 4: execute R script and analyze ─────────────────────────────────

describe('Scenario 4: execute R script and analyze', () => {
    it('scans workspace, executes script (mocked), streams LLM analysis', async () => {
        // Inline cassette content — only used in inline/replay-file modes.
        const inlineAnalysisText =
            'The script executed print(1 + 1). R evaluated 1 + 1 = 2 and printed [1] 2 to stdout.';

        const llm = makeTestLLM([
            {
                // streamPrompt: analysis of execution output
                response: {
                    content: inlineAnalysisText,
                    model: 'test-model',
                    provider: 'test',
                    usage: { promptTokens: 120, completionTokens: 35, totalTokens: 155 },
                },
            },
        ]);

        const registry = new ToolRegistry();
        registry.register(new FileScanTool(new DirectoryScanner()));
        registry.register(makeFakeRExec('[1] 2\n'));

        const events: Array<{ type: string; data: Record<string, unknown> }> = [];

        const useCase = new ExecuteRunUseCase({
            llm: llm as unknown as LLMController,
            registry,
            directory: workspace.root,
            emit: (type, data) => events.push({ type, data }),
        });

        // "execute hw5.R and analyze" → detectObviousIntent: "execute" + ".R" → "run"
        // (The intent check is done by IntentRouter/AgentService; here we call the use case directly)
        const result = await useCase.execute('execute hw5.R and analyze', []);

        // Script was found
        expect(result.scriptPath).not.toBeNull();
        expect(result.scriptPath).toContain('hw5.R');

        // Execution output came from fake r_exec
        expect(result.execOutput).toBe('[1] 2\n');

        // LLM produced an analysis (exact match only in inline/replay-file mode)
        if (MODE !== 'record') {
            expect(result.analysis).toBe(inlineAnalysisText);
        } else {
            expect(result.analysis.length).toBeGreaterThan(0);
        }

        // Events: scan → run → analyze phases
        const phaseStarts = events
            .filter(e => e.type === 'phase_start')
            .map(e => e.data['phase'] as string);
        expect(phaseStarts).toContain('scan');
        expect(phaseStarts).toContain('run');
        expect(phaseStarts).toContain('analyze');

        // Tokens streamed
        const tokens = events
            .filter(e => e.type === 'stream_token')
            .map(e => e.data['token'] as string)
            .join('');
        expect(tokens).toContain('print(1 + 1)');

        // text_output emitted with analysis
        const textOutput = events.find(e => e.type === 'text_output');
        expect(textOutput).toBeDefined();
        if (MODE !== 'record') {
            expect(textOutput?.data['content']).toBe(inlineAnalysisText);
        }

        // Usage tracked (streaming APIs may omit usage; only assert in inline/replay-file modes)
        if (MODE !== 'record') {
            expect(result.usage.inputTokens).toBeGreaterThan(0);
            expect(result.usage.outputTokens).toBeGreaterThan(0);
        }

        finishLLM(llm);
    }, TEST_TIMEOUT);
});
