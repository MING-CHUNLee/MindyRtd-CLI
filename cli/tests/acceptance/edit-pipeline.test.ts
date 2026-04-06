/**
 * Acceptance tests: edit pipeline (Scenarios 2 & 3)
 *
 * Scenario 2 — Edit with user approval
 *   Given a workspace with "script.R" containing `x <- 1\nprint(x)\n`
 *   When user asks "change the variable name to y in script.R"
 *   Then intent is classified as "edit"
 *   And the ReAct loop produces an edit artifact for script.R
 *   And a diff_proposed event is emitted
 *   When the user approves the diff
 *   Then edit_applied is emitted
 *   And script.R on disk contains `y <- 1\nprint(y)\n`
 *
 * Scenario 3 — Edit rejection
 *   Same setup, but the user rejects the diff.
 *   Then edit_rejected is emitted
 *   And script.R on disk is UNCHANGED
 *
 * LLM calls (3 per scenario):
 *   1. sendPrompt  — intent → "edit"
 *   2. sendPrompt  — ReAct step 1 → [THOUGHT]...[ANSWER] [{"path":"<abs>","content":"..."}]
 *   3. sendPrompt  — Evaluator retryWithCorrection:
 *        validateEditOutput('y <- 1\nprint(y)\n') fails (R code ≠ JSON array),
 *        so a retry LLM call is made.  The retry cassette returns valid JSON which
 *        populates validatedEdits correctly.
 *
 * Path strategy — cassettes use ABSOLUTE paths to workspace files so that
 * applyEdit(edit) resolves correctly regardless of process.cwd().
 * (applyEdit does `path.resolve(edit.path)`; absolute paths are cwd-independent.)
 *
 * ── Record mode NOT supported for edit pipeline ────────────────────────────
 * The ReAct cassette embeds an ABSOLUTE workspace path computed at test-setup
 * time (buildEditCassettes(absScriptPath)).  A real LLM would not know the
 * temp directory path, so automatic recording cannot produce cassettes that
 * work on the next run.  Edit cassettes must be hand-crafted.
 * Ask and run pipelines support ACCEPTANCE_TEST_MODE=record.
 */

import path from 'path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { RecordReplayLLM } from './helpers/record-replay-llm';
import { TestWorkspace } from './helpers/test-workspace';
import { createHarness } from './helpers/test-harness';
import type { ApprovalCallback } from '../../src/application/facade/agent-service';

// ── shared fixtures ───────────────────────────────────────────────────────────

const ORIGINAL_SCRIPT = 'x <- 1\nprint(x)\n';
const EDITED_SCRIPT   = 'y <- 1\nprint(y)\n';

// ── lifecycle ─────────────────────────────────────────────────────────────────

let workspace: TestWorkspace;

beforeEach(() => {
    workspace = TestWorkspace.create({ 'script.R': ORIGINAL_SCRIPT });
});

afterEach(() => {
    workspace.cleanup();
});

// ── Shared cassette factory (dynamic — uses absolute workspace path) ───────────

/**
 * Build the 3 cassette entries for an edit of script.R.
 * The absolute path is embedded in the cassette responses so that
 * stageFromArtifacts + applyEdit resolve correctly without process.chdir.
 */
function buildEditCassettes(absScriptPath: string) {
    const artifact = JSON.stringify([{ path: absScriptPath, content: EDITED_SCRIPT }]);

    return [
        {
            // 1. Intent classification → "edit"
            response: { content: 'edit', model: 'test-model', provider: 'test' },
        },
        {
            // 2. ReAct loop step 1 → immediate ANSWER with absolute-path edit artifact
            response: {
                content: `[THOUGHT] I need to rename variable x to y in script.R.\n[ANSWER] ${artifact}`,
                model: 'test-model',
                provider: 'test',
                usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
            },
        },
        {
            // 3. Evaluator retry — validateEditOutput('y <- 1\nprint(y)\n') fails
            //    (R code is not a JSON array).  Return valid JSON so validatedEdits
            //    is populated from this response, not the fallback.
            response: {
                content: artifact,
                model: 'test-model',
                provider: 'test',
            },
        },
    ];
}

// ── Scenario 2: edit with approval ───────────────────────────────────────────

describe('Scenario 2: edit with user approval', () => {
    it('proposes a diff, applies the edit, and writes the file to disk', async () => {
        const absScript = path.join(workspace.root, 'script.R');
        const llm = new RecordReplayLLM(buildEditCassettes(absScript));

        const { service, eventsOf } = createHarness({ workspace, llm });
        await service.initialize();
        await service.executeInstruction('change the variable name to y in script.R');

        // Intent
        const intentEvents = eventsOf('intent_classified');
        expect(intentEvents).toHaveLength(1);
        expect(intentEvents[0].data.intent).toBe('edit');

        // Diff was proposed
        const diffEvents = eventsOf('diff_proposed');
        expect(diffEvents).toHaveLength(1);
        expect(diffEvents[0].data.path).toBe(absScript);
        expect(diffEvents[0].data.original).toBe(ORIGINAL_SCRIPT);
        expect(diffEvents[0].data.proposed).toBe(EDITED_SCRIPT);

        // Edit was applied (default harness approves automatically)
        expect(eventsOf('edit_applied')).toHaveLength(1);
        expect(eventsOf('edit_applied')[0].data.path).toBe(absScript);
        expect(eventsOf('edit_rejected')).toHaveLength(0);

        // File on disk was updated
        expect(workspace.readFile('script.R')).toBe(EDITED_SCRIPT);

        // Turn persisted
        expect(eventsOf('turn_saved')).toHaveLength(1);

        // All cassettes consumed
        expect(llm.remaining).toBe(0);
    });
});

// ── Scenario 3: edit rejection ────────────────────────────────────────────────

describe('Scenario 3: edit rejection', () => {
    it('proposes a diff, skips write on rejection, file is unchanged', async () => {
        const absScript = path.join(workspace.root, 'script.R');
        const llm = new RecordReplayLLM(buildEditCassettes(absScript));

        const onApproval: ApprovalCallback = vi.fn().mockResolvedValue(false);
        const { service, eventsOf } = createHarness({ workspace, llm, onApproval });

        await service.initialize();
        await service.executeInstruction('change the variable name to y in script.R');

        // Diff was still proposed
        expect(eventsOf('diff_proposed')).toHaveLength(1);
        expect(eventsOf('diff_proposed')[0].data.path).toBe(absScript);

        // Edit was rejected
        expect(eventsOf('edit_rejected')).toHaveLength(1);
        expect(eventsOf('edit_rejected')[0].data.path).toBe(absScript);
        expect(eventsOf('edit_applied')).toHaveLength(0);

        // onApproval was called exactly once
        expect(onApproval).toHaveBeenCalledTimes(1);

        // File on disk is UNCHANGED
        expect(workspace.readFile('script.R')).toBe(ORIGINAL_SCRIPT);

        // Turn still persisted
        expect(eventsOf('turn_saved')).toHaveLength(1);

        // All cassettes consumed
        expect(llm.remaining).toBe(0);
    });
});
