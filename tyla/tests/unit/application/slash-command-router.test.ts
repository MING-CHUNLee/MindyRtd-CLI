/**
 * Unit Tests: SlashCommandRouter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlashCommandRouter, SlashCommandContext } from '../../../src/application/services/slash-command-router';
import { ModeManager } from '../../../src/application/services/mode-manager';
import { ConversationSession } from '../../../src/domain/entities/conversation-session';
import { SessionRepository } from '../../../src/infrastructure/persistence/session-repository';
import type { RBridgePort } from '../../../src/application/ports/r-bridge-port';

vi.mock('../../../src/infrastructure/config/settings', () => ({
    getSettings: vi.fn().mockReturnValue({ statusBar: { items: [] }, workflowMode: 'default' }),
    saveSettings: vi.fn(),
}));

function makeContext(overrides?: Partial<SlashCommandContext>): SlashCommandContext {
    const session = ConversationSession.create('test-model');
    return {
        session,
        repo: {
            save: vi.fn().mockResolvedValue(undefined),
            load: vi.fn().mockResolvedValue(null),
            loadLast: vi.fn().mockResolvedValue(null),
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined),
        } as unknown as SessionRepository,
        modeManager: new ModeManager(),
        initialModel: 'test-model',
        setSession: vi.fn(),
        setPreviousSummary: vi.fn(),
        ...overrides,
    };
}

function makeBridge(overrides: Partial<RBridgePort> = {}): RBridgePort {
    return {
        isListenerRunning: vi.fn().mockReturnValue(true),
        getCurrentFile: vi.fn().mockResolvedValue('/project/active.R'),
        runCurrentFile: vi.fn().mockResolvedValue({ id: '1', status: 'completed', output: 'ok' }),
        ...overrides,
    } as unknown as RBridgePort;
}

describe('SlashCommandRouter', () => {
    describe('/status', () => {
        it('returns session info', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/status');
            expect(result).toContain('Session:');
            expect(result).toContain('Context:');
        });
    });

    describe('/run', () => {
        it('prompts to start listener when RBridge is missing', async () => {
            const ctx = makeContext({ rBridge: undefined });
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/run');
            expect(result).toContain('tyla::start');
        });

        it('runs current file via RBridge and prints raw output', async () => {
            const bridge = makeBridge({
                runCurrentFile: vi.fn().mockResolvedValue({ id: '1', status: 'completed', output: 'hello' }),
            });
            const ctx = makeContext({ rBridge: bridge });
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/run');
            expect(bridge.runCurrentFile).toHaveBeenCalledOnce();
            expect(result).toBe('hello');
        });
    });

    describe('/new', () => {
        it('creates a new session and calls setSession', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/new');
            expect(result).toContain('New session created:');
            expect(ctx.setSession).toHaveBeenCalled();
            expect(ctx.setPreviousSummary).toHaveBeenCalled();
        });
    });

    describe('/rollback', () => {
        it('handles invalid index gracefully', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/rollback 99');
            expect(result).toContain('Rollback failed');
        });

        it('rolls back to a valid turn', async () => {
            const session = ConversationSession.create('test-model');
            const usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
            session.addTurn('q1', 'a1', usage);
            session.addTurn('q2', 'a2', usage);
            const ctx = makeContext({ session });
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/rollback 1');
            expect(result).toContain('Rolled back to turn 1');
            expect(result).toContain('1 turn(s)');
            expect(ctx.repo.save).toHaveBeenCalledWith(session);
        });

        it('/rollback list prints a numbered turn list', async () => {
            const session = ConversationSession.create('test-model');
            const usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
            session.addTurn('q1', 'a1', usage);
            session.addTurn('q2', 'a2', usage);
            const ctx = makeContext({ session });
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/rollback list');
            expect(result).toContain('1.');
            expect(result).toContain('q1');
            expect(result).toContain('2.');
            expect(result).toContain('q2');
        });

        it('/rollback session list formats recent sessions', async () => {
            const ctx = makeContext();
            (ctx.repo.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
                { id: 'session-1', model: 'm1', startedAt: new Date('2026-04-14T00:00:00Z'), turnCount: 3 },
                { id: 'session-2', model: 'm2', startedAt: new Date('2026-04-13T00:00:00Z'), turnCount: 1 },
            ]);
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/rollback session list');
            expect(result).toContain('session-1');
            expect(result).toContain('3 turns');
        });

        it('/rollback session <id> <n> rolls back a saved session and saves it', async () => {
            const loaded = ConversationSession.create('test-model');
            const usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
            loaded.addTurn('q1', 'a1', usage);
            loaded.addTurn('q2', 'a2', usage);

            const ctx = makeContext();
            (ctx.repo.load as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(loaded);

            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/rollback session session-xyz 1');

            expect(ctx.repo.save).toHaveBeenCalledWith(loaded);
            expect(result).toContain('session-xyz');
            expect(loaded.turnCount).toBe(1);
        });
    });

    describe('/help', () => {
        it('returns available commands list', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/help');
            expect(result).toContain('/status');
            expect(result).toContain('/run');
            expect(result).toContain('/rollback');
            expect(result).toContain('/exit');
            expect(result).not.toContain('/solver');
            expect(result).not.toContain('/tutor-socratic');
            expect(result).not.toContain('/tutor-guide');
            expect(result).not.toContain('/default');
            expect(result).not.toContain('/mode');
        });
    });

    describe('unknown command', () => {
        it('returns unknown command message', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/xyz');
            expect(result).toContain('Unknown command');
        });
    });

    describe('formatSessionSummary', () => {
        it('returns empty string for session with no history', () => {
            const session = ConversationSession.create('test');
            expect(SlashCommandRouter.formatSessionSummary(session)).toBe('');
        });

        it('returns summary for session with history', () => {
            const session = ConversationSession.create('test');
            const usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
            session.addTurn('Hello', 'Hi there', usage);
            const result = SlashCommandRouter.formatSessionSummary(session);
            expect(result).toContain('[Previous session');
            expect(result).toContain('User: Hello');
            expect(result).toContain('Assistant: Hi there');
        });

        it('truncates long messages in summary', () => {
            const session = ConversationSession.create('test');
            const usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
            const longMsg = 'x'.repeat(500);
            session.addTurn(longMsg, 'short', usage);
            const result = SlashCommandRouter.formatSessionSummary(session);
            expect(result).toContain('…');
            expect(result).not.toContain('x'.repeat(400));
        });
    });
});
