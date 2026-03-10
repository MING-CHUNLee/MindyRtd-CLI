/**
 * Presentation View: ContextStatusBar
 *
 * Renders a ccstatusline-inspired context health display after each
 * agent turn. Shows:
 *   - Session ID + turn number
 *   - Context window fill bar + % (color-coded by health)
 *   - Cache savings (cumulative)
 *   - Session cost estimate
 *   - Health warnings when approaching context limits
 */

import chalk from 'chalk';
import { ConversationSession } from '../../application/domain/entities/conversation-session';
import { ContextHealth } from '../../application/domain/values/token-budget';

const BAR_WIDTH = 20;

export class ContextStatusBar {
    render(session: ConversationSession): void {
        const budget = session.tokenBudget;
        const cache  = session.cacheStatus;

        const usedK  = (budget.snapshot.inputTokens / 1_000).toFixed(1);
        const maxK   = (budget.maxContextTokens / 1_000).toFixed(0);
        const pct    = `${budget.usagePercent}%`;

        const bar     = this.makeBar(budget.usagePercent, budget.health);
        const pctStr  = this.colorByHealth(pct.padStart(4), budget.health);
        const tokenStr = chalk.dim(`${usedK}k / ${maxK}k tokens`);

        const cacheStr = cache.hasCacheActivity
            ? chalk.green(`💾 ${(cache.cacheReadTokens / 1_000).toFixed(1)}k cached  saves ~$${cache.estimatedSavingsUSD.toFixed(4)}`)
            : chalk.dim('💾 no cache activity');

        const costStr  = chalk.dim(`session ~$${session.totalCostUSD.toFixed(4)}`);
        const modelStr = chalk.dim(session.model);
        const idStr    = chalk.dim(`#${session.id.slice(-6)}  turn ${session.turnCount}`);

        console.log('');
        console.log(chalk.dim('─────────────────────────────────────────────────────'));
        console.log(`  ${idStr}  ·  ${modelStr}`);
        console.log(`  Context  ${bar} ${pctStr}  ${tokenStr}`);
        console.log(`  ${cacheStr}  ·  ${costStr}`);
        console.log(chalk.dim('─────────────────────────────────────────────────────'));

        this.renderHealthWarning(budget.health, budget.usagePercent);
        console.log('');
    }

    private makeBar(percent: number, health: ContextHealth): string {
        const filled = Math.round((percent / 100) * BAR_WIDTH);
        const empty  = BAR_WIDTH - filled;
        const raw    = '█'.repeat(filled) + '░'.repeat(empty);
        return this.colorByHealth(raw, health);
    }

    private colorByHealth(text: string, health: ContextHealth): string {
        switch (health) {
            case 'healthy':       return chalk.green(text);
            case 'warning':       return chalk.yellow(text);
            case 'critical':      return chalk.red(text);
            case 'overflow_risk': return chalk.bold.red(text);
        }
    }

    private renderHealthWarning(health: ContextHealth, percent: number): void {
        switch (health) {
            case 'warning':
                console.log(chalk.yellow(`  ⚠  Context at ${percent}% — consider --new for a fresh session soon`));
                break;
            case 'critical':
                console.log(chalk.red(`  ⚠  Context critical (${percent}%) — agent may lose early context`));
                break;
            case 'overflow_risk':
                console.log(chalk.bold.red(`  🚨 Context overflow risk (${percent}%) — run with --new to start fresh`));
                break;
        }
    }
}
