/**
 * Service: SlashCommandRouter
 *
 * Parses and dispatches slash commands. Returns string results
 * (same contract as the original AgentService.handleSlashCommand).
 */

import { ConversationSession } from '../../domain/entities/conversation-session';
import { SessionStore } from '../../domain/repositories/session-store';
import { LLMGateway } from '../../domain/types/llm-gateway';
import { WorkflowMode } from '../../infrastructure/config/settings';
import { ModeManager } from './mode-manager';

export interface SlashCommandContext {
    session: ConversationSession;
    repo: SessionStore;
    modeManager: ModeManager;
    llm: LLMGateway;
    setSession: (s: ConversationSession) => void;
    setPreviousSummary: (s: string) => void;
}

export class SlashCommandRouter {
    constructor(private ctx: SlashCommandContext) {}

    async handle(command: string): Promise<string> {
        if (!command.startsWith('/')) return `Not a slash command: ${command}`;
        const [cmd, ...args] = command.slice(1).split(' ');
        switch (cmd) {
            case 'status':
                return this.getStatusText();
            case 'new': {
                this.ctx.setPreviousSummary(SlashCommandRouter.formatSessionSummary(this.ctx.session));
                const model = this.ctx.llm.getProviderInfo().model;
                const newSession = ConversationSession.create(model);
                this.ctx.setSession(newSession);
                return `New session created: ${newSession.id.slice(-6)}`;
            }
            case 'rollback': {
                const target = parseInt(args[0] ?? String(this.ctx.session.turnCount - 1), 10);
                try {
                    this.ctx.session.rollbackTo(target);
                    await this.ctx.repo.save(this.ctx.session);
                    return `Rolled back to turn ${target}. Session now has ${this.ctx.session.turnCount} turn(s).`;
                } catch (error) {
                    return `Rollback failed: ${error instanceof Error ? error.message : String(error)}`;
                }
            }  
            // switch fall-through
            case 'solver':
            case 'tutor-socratic':
            case 'tutor-guide':
            case 'default': {
                // Switch cases enumerate all valid WorkflowMode values — cast is safe.
                this.ctx.modeManager.setMode(cmd as WorkflowMode);
                return `Mode: ${cmd}`;
            }
            case 'mode':
                return `Current mode: ${this.ctx.modeManager.getMode()}`;
            case 'help':
                return [
                    'Available commands:',
                    '  /status          — Show session info',
                    '  /new             — Start a new session',
                    '  /rollback [n]    — Roll back to turn n',
                    '  /solver          — Switch to solver mode (generates solution files)',
                    '  /tutor-socratic  — Switch to Socratic tutor mode (guides with questions)',
                    '  /tutor-guide     — Switch to guided tutor mode (step-by-step hints)',
                    '  /default         — Return to normal mode',
                    '  /mode            — Show current active mode',
                    '  /exit            — Exit the REPL',
                    '  /help            — Show this help',
                ].join('\n');
            default:
                return `Unknown command: /${cmd}. Type /help for available commands.`;
        }
    }

    // ── Private utilities ─────────────────────────────────────────────────────

    private getStatusText(): string {
        const session = this.ctx.session;
        const budget = session.tokenBudget;
        const cache = session.cacheStatus;
        return [
            `Session: ${session.id.slice(-6)} | Turn: ${session.turnCount} | Model: ${session.model}`,
            `Context: ${budget.usagePercent}% (${budget.health})`,
            `Cost: ~$${session.totalCostUSD.toFixed(4)}`,
            cache.hasCacheActivity ? `Cache: ${(cache.cacheReadTokens / 1_000).toFixed(1)}k tokens saved` : '',
        ].filter(Boolean).join('\n');
    }

    private static readonly MAX_SNIPPET_LENGTH = 300;

    /** Build a compact summary of the last few turns for cross-session context. */
    static formatSessionSummary(session: ConversationSession): string {
        const history = session.getHistory();
        if (history.length === 0) return '';
        const lastN = history.slice(-6);
        const lines = lastN.map(m => {
            const role = m.role === 'user' ? 'User' : 'Assistant';
            const snippet = m.content.length > SlashCommandRouter.MAX_SNIPPET_LENGTH
                ? m.content.slice(0, SlashCommandRouter.MAX_SNIPPET_LENGTH) + '…'
                : m.content;
            return `${role}: ${snippet}`;
        });
        return `[Previous session — last ${Math.floor(lastN.length / 2)} turn(s)]\n${lines.join('\n')}`;
    }
}
