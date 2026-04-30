/**
 * Service: SlashCommandRouter
 *
 * Parses and dispatches slash commands. Returns string results
 * (same contract as the original AgentService.handleSlashCommand).
 */

import { ConversationSession } from '../../domain/entities/conversation-session';
import { SessionStore } from '../../domain/repositories/session-store';
import { WorkflowMode } from '../../infrastructure/config/settings';
import { ModeManager } from './mode-manager';
import type { RBridgePort } from '../ports/r-bridge-port';
import { PolicyLoader } from '../../infrastructure/config/policy-loader';
import { StressTestService } from './stress-test-service';
import type { LLMGateway } from '../../domain/types/llm-gateway';

export interface SlashCommandContext {
    session: ConversationSession;
    repo: SessionStore;
    modeManager: ModeManager;
    /** Optional RStudio listener bridge for /run. */
    rBridge?: RBridgePort;
    /** Plain model name — replaces llm.getProviderInfo().model used by /new. */
    initialModel: string;
    /** LLM gateway — used by /stress-test. */
    llm?: LLMGateway;
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
            case 'run': {
                const bridge = this.ctx.rBridge;
                if (!bridge || !bridge.isListenerRunning()) {
                    return '請先在 RStudio 執行 mindy::start()';
                }
                const result = await bridge.runCurrentFile();
                if (result.status === 'error') {
                    return `Run failed: ${result.error ?? '(unknown error)'}`;
                }
                return (result.output ?? '').trim() || '(no output)';
            }
            case 'new': {
                this.ctx.setPreviousSummary(SlashCommandRouter.formatSessionSummary(this.ctx.session));
                const model = this.ctx.initialModel;
                const newSession = ConversationSession.create(model);
                this.ctx.setSession(newSession);
                return `New session created: ${newSession.id.slice(-6)}`;
            }
            case 'rollback': {
                // /rollback list
                if (args[0] === 'list') {
                    return this.formatTurnList(this.ctx.session);
                }

                // /rollback session list
                if (args[0] === 'session' && args[1] === 'list') {
                    const sessions = await this.ctx.repo.list();
                    if (sessions.length === 0) return 'No saved sessions found.';
                    return sessions
                        .slice(0, 20)
                        .map(s => {
                            const date = s.startedAt.toISOString().slice(0, 10);
                            return `${s.id}  (${s.turnCount} turns, ${date}, model: ${s.model})`;
                        })
                        .join('\n');
                }

                // /rollback session <id> <n>
                if (args[0] === 'session' && args[1] && args[2]) {
                    const sessionId = args[1];
                    const target = parseInt(args[2], 10);
                    const session = await this.ctx.repo.load(sessionId);
                    if (!session) return `Session not found: ${sessionId}`;
                    try {
                        session.rollbackTo(target);
                        await this.ctx.repo.save(session);
                        return `Rolled back session ${sessionId} to turn ${target}. Session now has ${session.turnCount} turn(s).`;
                    } catch (error) {
                        return `Rollback failed: ${error instanceof Error ? error.message : String(error)}`;
                    }
                }

                // /rollback <n> (default: last turn)
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
            case 'policy': {
                const mode = this.ctx.modeManager.getMode();
                const policy = new PolicyLoader().load(mode);
                if (!policy) return `No policy file found for mode: ${mode}`;
                return `Current mode: ${mode}\n\n${policy}`;
            }
            case 'stress-test': {
                if (!this.ctx.llm) return 'stress-test requires an LLM connection.';
                const mode = this.ctx.modeManager.getMode();
                const service = new StressTestService(this.ctx.llm);
                const cases = service.getTestCases(mode);
                const lines: string[] = [`Running stress test for mode: ${mode} (${cases.length} cases)...\n`];
                const report = await service.run(mode, (i, _total, result) => {
                    const status = result.passed ? 'PASS' : 'FAIL';
                    const snippet = result.response.length > 60
                        ? result.response.slice(0, 60) + '…'
                        : result.response;
                    lines.push(`[${i + 1}/${cases.length}] ${result.case.attackType.padEnd(20)} → ${status}  "${snippet}"`);
                });
                lines.push('');
                lines.push(`Result: ${report.passCount}/${cases.length} passed  |  ${report.failCount} boundary violation(s)`);
                if (report.suggestion) {
                    lines.push('');
                    lines.push(`Suggestion: ${report.suggestion}`);
                }
                return lines.join('\n');
            }
            case 'help':
                return [
                    'Available commands:',
                    '  /status          — Show session info',
                    '  /run             — Run the current RStudio file (no LLM)',
                    '  /new             — Start a new session',
                    '  /rollback [n]    — Roll back to turn n',
                    '  /rollback list   — List turns in current session',
                    '  /rollback session list        — List recent saved sessions',
                    '  /rollback session <id> <n>    — Roll back a saved session to turn n',
                    '  /solver          — Switch to solver mode (generates solution files)',
                    '  /tutor-socratic  — Switch to Socratic tutor mode (guides with questions)',
                    '  /tutor-guide     — Switch to guided tutor mode (step-by-step hints)',
                    '  /default         — Return to normal mode',
                    '  /mode            — Show current active mode',
                    '  /policy          — Show policy rules for the current mode',
                    '  /stress-test     — Run automated Red Teaming against the current mode',
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

    private formatTurnList(session: ConversationSession): string {
        const turns = session.turns;
        if (turns.length === 0) return 'No turns yet.';
        return turns
            .map(t => {
                const ts = t.timestamp.toISOString();
                const preview = t.userMessage.length > 80 ? t.userMessage.slice(0, 80) + '…' : t.userMessage;
                return `${t.turnNumber}. ${ts}  ${preview}`;
            })
            .join('\n');
    }

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
