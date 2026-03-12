/**
 * Presentation View: ContextStatusBar
 *
 * Single-line configurable status display after each agent turn.
 * Default: model · context bar % · req/min
 * Users can customize via .mindy/settings.json
 */

import chalk from 'chalk';
import { ConversationSession } from '../../domain/entities/conversation-session';
import { ContextHealth } from '../../domain/values/token-budget';
import { getSettings, StatusBarItem } from '../../infrastructure/config/settings';
import { formatDuration } from '../../shared/utils/format';

const BAR_WIDTH = 20;

type ItemRenderer = (session: ConversationSession) => string | undefined;

const RENDERERS: Record<StatusBarItem, ItemRenderer> = {
    model: (s) => chalk.white(s.model),

    context: (s) => {
        const budget = s.tokenBudget;
        const bar = makeBar(budget.usagePercent, budget.health);
        const pct = colorByHealth(`${budget.usagePercent}%`, budget.health);
        return `${bar} ${pct}`;
    },

    rpm: (s) => {
        const rpm = s.requestsPerMinute;
        return chalk.dim(`${rpm} req/min`);
    },

    cost: (s) => chalk.dim(`~$${s.totalCostUSD.toFixed(4)}`),

    turn: (s) => chalk.dim(`turn ${s.turnCount}`),

    duration: (s) => chalk.dim(formatDuration(s.elapsedMs)),

    tps: (s) => {
        const tps = s.lastTokensPerSecond;
        return tps !== undefined ? chalk.dim(`${tps} tok/s`) : undefined;
    },

    latency: (s) => {
        const ms = s.lastResponseTimeMs;
        return ms !== undefined ? chalk.dim(formatDuration(ms)) : undefined;
    },
};

export class ContextStatusBar {
    render(session: ConversationSession): void {
        const settings = getSettings();
        const parts: string[] = [];

        for (const key of settings.statusBar.items) {
            const renderer = RENDERERS[key];
            if (!renderer) continue;
            const text = renderer(session);
            if (text) parts.push(text);
        }

        const line = parts.join(chalk.dim(' · '));
        const border = chalk.dim('──');

        console.log('');
        console.log(`${border} ${line} ${border}`);
        this.renderHealthWarning(session.tokenBudget.health, session.tokenBudget.usagePercent);
        console.log('');
    }

    private renderHealthWarning(health: ContextHealth, percent: number): void {
        switch (health) {
            case 'warning':
                console.log(chalk.yellow(`   Context at ${percent}% — consider --new for a fresh session soon`));
                break;
            case 'critical':
                console.log(chalk.red(`   Context critical (${percent}%) — agent may lose early context`));
                break;
            case 'overflow_risk':
                console.log(chalk.bold.red(`   Context overflow risk (${percent}%) — run with --new to start fresh`));
                break;
        }
    }
}

function makeBar(percent: number, health: ContextHealth): string {
    const filled = Math.round((percent / 100) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const raw = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
    return colorByHealth(raw, health);
}

function colorByHealth(text: string, health: ContextHealth): string {
    switch (health) {
        case 'healthy': return chalk.green(text);
        case 'warning': return chalk.yellow(text);
        case 'critical': return chalk.red(text);
        case 'overflow_risk': return chalk.bold.red(text);
    }
}
