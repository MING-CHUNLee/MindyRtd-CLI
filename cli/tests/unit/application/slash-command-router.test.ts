/**
 * Unit Tests: SlashCommandRouter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlashCommandRouter, SlashCommandContext } from '../../../src/application/services/slash-command-router';
import { ModeManager } from '../../../src/application/services/mode-manager';
import { ConversationSession } from '../../../src/domain/entities/conversation-session';
import { SessionRepository } from '../../../src/infrastructure/persistence/session-repository';
import { LLMController } from '../../../src/infrastructure/api/llm-controller';

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
        } as unknown as SessionRepository,
        modeManager: new ModeManager(),
        llm: {
            getProviderInfo: vi.fn().mockReturnValue({ model: 'test-model', provider: 'test' }),
        } as unknown as LLMController,
        setSession: vi.fn(),
        setPreviousSummary: vi.fn(),
        ...overrides,
    };
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
    });

    describe('mode commands', () => {
        it('/solver switches mode', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/solver');
            expect(result).toBe('Mode: solver');
            expect(ctx.modeManager.getMode()).toBe('solver');
        });

        it('/tutor-socratic switches mode', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/tutor-socratic');
            expect(result).toBe('Mode: tutor-socratic');
            expect(ctx.modeManager.getMode()).toBe('tutor-socratic');
        });

        it('/tutor-guide switches mode', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/tutor-guide');
            expect(result).toBe('Mode: tutor-guide');
            expect(ctx.modeManager.getMode()).toBe('tutor-guide');
        });

        it('/default resets mode', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            await router.handle('/solver');
            const result = await router.handle('/default');
            expect(result).toBe('Mode: default');
            expect(ctx.modeManager.getMode()).toBe('default');
        });

        it('/mode reports current mode', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            await router.handle('/tutor-guide');
            const result = await router.handle('/mode');
            expect(result).toContain('tutor-guide');
        });
    });

    describe('/help', () => {
        it('returns available commands list', async () => {
            const ctx = makeContext();
            const router = new SlashCommandRouter(ctx);
            const result = await router.handle('/help');
            expect(result).toContain('/status');
            expect(result).toContain('/rollback');
            expect(result).toContain('/exit');
            expect(result).toContain('/solver');
            expect(result).toContain('/tutor-socratic');
            expect(result).toContain('/tutor-guide');
            expect(result).toContain('/default');
            expect(result).toContain('/mode');
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
