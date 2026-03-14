/**
 * Unit Tests: AgentService
 *
 * Uses dependency injection (AgentServiceDeps) to isolate the service
 * from real LLM calls, filesystem I/O, and session persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AgentService,
    AgentServiceDeps,
    AgentEvent,
    ProposedEdit,
} from '../src/application/services/agent-service';
import { LLMController } from '../src/infrastructure/api/llm-controller';
import { SessionRepository } from '../src/infrastructure/persistence/session-repository';
import { DiffEngine } from '../src/application/services/diff-engine';
import { ConversationSession } from '../src/domain/entities/conversation-session';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/infrastructure/plugins/plugin-loader', () => ({
    PluginLoader: vi.fn(function() {
        return { loadAll: vi.fn().mockResolvedValue([]) };
    }),
}));

vi.mock('../src/application/tools/file-scan-tool', () => ({
    FileScanTool: vi.fn(function() {
        return {
            name: 'file_scan',
            schema: { name: 'file_scan', description: 'scan', parameters: {} },
            execute: vi.fn().mockResolvedValue({ content: '', isError: false, data: { files: {} } }),
        };
    }),
}));

vi.mock('../src/application/tools/file-read-tool', () => ({
    FileReadTool: vi.fn(function() {
        return {
            name: 'file_read',
            schema: { name: 'file_read', description: 'read', parameters: {} },
            execute: vi.fn().mockResolvedValue({ content: '', isError: false }),
        };
    }),
}));

vi.mock('../src/application/tools/r-exec-tool', () => ({
    RExecTool: vi.fn(function() {
        return {
            name: 'r_exec',
            schema: { name: 'r_exec', description: 'exec', parameters: {} },
            execute: vi.fn().mockResolvedValue({ content: '', isError: false }),
        };
    }),
}));

vi.mock('../src/infrastructure/persistence/knowledge-repository', () => ({
    KnowledgeRepository: vi.fn().mockImplementation(() => ({
        load: vi.fn().mockReturnValue([]),
    })),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeMockSession(turnCount = 0): ConversationSession {
    const session = ConversationSession.create('claude-test');
    // Simulate existing turns via the public interface if needed
    return session;
}

function makeMockLLM(intentResponse = 'ask', streamContent = 'Test answer'): LLMController {
    return {
        sendPrompt: vi.fn().mockResolvedValue({ content: intentResponse }),
        streamPrompt: vi.fn().mockResolvedValue({
            content: streamContent,
            usage: { promptTokens: 10, completionTokens: 20 },
        }),
        getProviderInfo: vi.fn().mockReturnValue({ model: 'claude-test', provider: 'anthropic' }),
    } as unknown as LLMController;
}

function makeMockRepo(session?: ConversationSession): SessionRepository {
    const s = session ?? makeMockSession();
    return {
        load: vi.fn().mockResolvedValue(null),
        loadLast: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
    } as unknown as SessionRepository;
}

function makeMockDiffEngine(): DiffEngine {
    return {
        generateColoredDiff: vi.fn().mockReturnValue('+ new line\n- old line\n'),
    } as unknown as DiffEngine;
}

function makeService(
    llmOverrides?: Partial<ReturnType<typeof makeMockLLM>>,
    approvalResult = true,
): {
    service: AgentService;
    events: AgentEvent[];
    llm: LLMController;
    repo: SessionRepository;
    diffEngine: DiffEngine;
} {
    const events: AgentEvent[] = [];
    const llm = { ...makeMockLLM(), ...llmOverrides } as unknown as LLMController;
    const repo = makeMockRepo();
    const diffEngine = makeMockDiffEngine();

    const deps: AgentServiceDeps = { llm, repo, diffEngine };

    const service = new AgentService(
        { directory: '/fake/project' },
        (event) => events.push(event),
        async (_edit: ProposedEdit) => approvalResult,
        deps,
    );

    return { service, events, llm, repo, diffEngine };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentService', () => {
    describe('initialize()', () => {
        it('creates a new session when no prior session exists', async () => {
            const { service, events } = makeService();
            await service.initialize();

            const loaded = events.find(e => e.type === 'session_loaded');
            expect(loaded).toBeDefined();
            expect(loaded!.data.turnCount).toBe(0);
        });

        it('uses injected LLM provider info for model name', async () => {
            const { service, events } = makeService();
            await service.initialize();

            const loaded = events.find(e => e.type === 'session_loaded');
            expect(loaded!.data.model).toBe('claude-test');
        });

        it('getSession() returns the initialized session', async () => {
            const { service } = makeService();
            await service.initialize();

            const session = service.getSession();
            expect(session).toBeDefined();
            expect(session.model).toBe('claude-test');
        });

        it('throws if getSession() called before initialize()', () => {
            const { service } = makeService();
            expect(() => service.getSession()).toThrow('not initialized');
        });
    });

    describe('executeInstruction() — ask mode', () => {
        it('emits intent_classified with intent=ask when LLM returns "ask"', async () => {
            const { service, events, llm } = makeService();
            (llm.sendPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'ask' });
            await service.initialize();

            await service.executeInstruction('What does this function do?');

            const intentEvent = events.find(e => e.type === 'intent_classified');
            expect(intentEvent?.data.intent).toBe('ask');
        });

        it('emits stream_token events during ask mode', async () => {
            const { service, events, llm } = makeService();
            (llm.sendPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'ask' });
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockImplementation(
                async (_req: unknown, onToken: (t: string) => void) => {
                    onToken('Hello');
                    onToken(' world');
                    return { content: 'Hello world', usage: { promptTokens: 5, completionTokens: 5 } };
                },
            );
            await service.initialize();

            await service.executeInstruction('explain this code');

            const tokenEvents = events.filter(e => e.type === 'stream_token');
            expect(tokenEvents.length).toBeGreaterThan(0);
        });

        it('emits text_output with the LLM response content', async () => {
            const { service, events, llm } = makeService();
            (llm.sendPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'ask' });
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
                content: 'The answer is 42.',
                usage: { promptTokens: 10, completionTokens: 10 },
            });
            await service.initialize();

            await service.executeInstruction('What is the meaning of life?');

            const textEvent = events.find(e => e.type === 'text_output');
            expect(textEvent?.data.content).toBe('The answer is 42.');
        });

        it('emits turn_saved after successful ask', async () => {
            const { service, events, llm } = makeService();
            (llm.sendPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'ask' });
            await service.initialize();

            await service.executeInstruction('simple question?');

            const saved = events.find(e => e.type === 'turn_saved');
            expect(saved).toBeDefined();
        });

        it('emits error event when streamPrompt throws', async () => {
            const { service, events, llm } = makeService();
            (llm.sendPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({ content: 'ask' });
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));
            await service.initialize();

            await service.executeInstruction('explain something');

            const errorEvent = events.find(e => e.type === 'error');
            expect(errorEvent?.data.message).toContain('API down');
            expect(errorEvent?.data.phase).toBe('ask');
        });
    });

    describe('executeInstruction() — intent classification fallback', () => {
        it('emits status_update warning when intent classification fails', async () => {
            const { service, events, llm } = makeService();
            // First call (intent) throws; orchestrator call also returns something
            (llm.sendPrompt as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValue({ content: 'edit result' });
            (llm.streamPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
                content: '',
                usage: { promptTokens: 0, completionTokens: 0 },
            });
            await service.initialize();

            // Should default to 'edit' mode without crashing
            await service.executeInstruction('fix the bug');

            const warning = events.find(
                e => e.type === 'status_update' && String(e.data.warning ?? '').includes('Intent classification failed'),
            );
            expect(warning).toBeDefined();
        });
    });

    describe('handleSlashCommand()', () => {
        it('/status returns session info string', async () => {
            const { service } = makeService();
            await service.initialize();

            const result = await service.handleSlashCommand('/status');

            expect(result).toContain('Session:');
            expect(result).toContain('Context:');
        });

        it('/new creates a new session', async () => {
            const { service } = makeService();
            await service.initialize();
            const oldId = service.getSession().id;

            await service.handleSlashCommand('/new');

            expect(service.getSession().id).not.toBe(oldId);
        });

        it('/help returns available commands list', async () => {
            const { service } = makeService();
            await service.initialize();

            const result = await service.handleSlashCommand('/help');

            expect(result).toContain('/status');
            expect(result).toContain('/rollback');
            expect(result).toContain('/exit');
        });

        it('/unknown returns unknown command message', async () => {
            const { service } = makeService();
            await service.initialize();

            const result = await service.handleSlashCommand('/xyz');

            expect(result).toContain('Unknown command');
        });

        it('/rollback handles invalid index gracefully', async () => {
            const { service } = makeService();
            await service.initialize();

            // Rollback to turn 99 on a fresh session with 0 turns should fail gracefully
            const result = await service.handleSlashCommand('/rollback 99');

            expect(result).toContain('Rollback failed');
        });
    });
});
