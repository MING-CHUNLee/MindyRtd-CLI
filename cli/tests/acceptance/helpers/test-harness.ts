/**
 * Test Harness
 *
 * Constructs a real AgentService wired with a RecordReplayLLM and a real
 * (but temporary) SessionRepository.  All events are collected into an array
 * so tests can assert on the full event stream.
 *
 * IMPORTANT: call process.chdir(workspace.root) BEFORE createHarness() so that
 * SessionRepository (which reads process.cwd()) writes sessions to the temp dir.
 */

import { AgentService } from '../../../src/application/facade/agent-service';
import type { AgentEvent, ApprovalCallback } from '../../../src/application/facade/agent-service';
import { DiffEngine } from '../../../src/application/services/diff-engine';
import type { SessionRepository } from '../../../src/infrastructure/persistence/session-repository';
import type { LLMController } from '../../../src/infrastructure/api/llm-controller';
import type { RecordReplayLLM } from './record-replay-llm';
import type { TestWorkspace } from './test-workspace';

/**
 * No-op SessionRepository stub.
 * Avoids writing sessions to the real .mindy/ directory during tests,
 * and eliminates any reliance on process.cwd() for path resolution.
 */
const noopRepo = {
    save: async () => {},
    load: async () => null,
    loadLast: async () => null,
    list: async () => [],
    delete: async () => {},
} as unknown as SessionRepository;

export interface HarnessOpts {
    workspace: TestWorkspace;
    llm: RecordReplayLLM;
    /** Default: auto-approve every edit. */
    onApproval?: ApprovalCallback;
}

export interface Harness {
    service: AgentService;
    events: AgentEvent[];
    /** Convenience: events of a given type */
    eventsOf<T extends AgentEvent['type']>(type: T): Extract<AgentEvent, { type: T }>[];
}

export function createHarness(opts: HarnessOpts): Harness {
    const events: AgentEvent[] = [];
    const onApproval: ApprovalCallback = opts.onApproval ?? (() => Promise.resolve(true));

    const service = new AgentService(
        { directory: opts.workspace.root },
        (event) => events.push(event),
        onApproval,
        {
            // Cast: RecordReplayLLM satisfies the three methods used at runtime
            llm: opts.llm as unknown as LLMController,
            repo: noopRepo,
            diffEngine: new DiffEngine(),
        },
    );

    return {
        service,
        events,
        eventsOf<T extends AgentEvent['type']>(type: T) {
            return events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);
        },
    };
}
