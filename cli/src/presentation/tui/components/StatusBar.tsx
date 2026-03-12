/**
 * StatusBar Component (Ink TUI)
 *
 * Single-line configurable status display matching ContextStatusBar.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
    model: string;
    usagePercent: number;
    health: 'healthy' | 'warning' | 'critical' | 'overflow_risk';
    items: string[];
    totalCostUSD?: number;
    turnCount?: number;
    elapsedMs?: number;
    requestsPerMinute?: number;
    lastTokensPerSecond?: number;
    lastResponseTimeMs?: number;
}

const BAR_WIDTH = 20;

function healthColor(health: string): string {
    switch (health) {
        case 'healthy': return 'green';
        case 'warning': return 'yellow';
        case 'critical': case 'overflow_risk': return 'red';
        default: return 'gray';
    }
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

const StatusBar: React.FC<StatusBarProps> = (props) => {
    const { items, health, usagePercent } = props;
    const color = healthColor(health);

    const filled = Math.round((usagePercent / 100) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

    const renderers: Record<string, () => React.ReactNode | null> = {
        model: () => <Text>{props.model}</Text>,
        context: () => (
            <Text>
                <Text color={color}>{bar}</Text>
                <Text color={color}> {usagePercent}%</Text>
            </Text>
        ),
        rpm: () => <Text dimColor>{props.requestsPerMinute ?? 0} req/min</Text>,
        cost: () => props.totalCostUSD !== undefined
            ? <Text dimColor>~${props.totalCostUSD.toFixed(4)}</Text> : null,
        turn: () => props.turnCount !== undefined
            ? <Text dimColor>turn {props.turnCount}</Text> : null,
        duration: () => props.elapsedMs !== undefined
            ? <Text dimColor>{formatDuration(props.elapsedMs)}</Text> : null,
        tps: () => props.lastTokensPerSecond !== undefined
            ? <Text dimColor>{props.lastTokensPerSecond} tok/s</Text> : null,
        latency: () => props.lastResponseTimeMs !== undefined
            ? <Text dimColor>{formatDuration(props.lastResponseTimeMs)}</Text> : null,
    };

    const parts: React.ReactNode[] = [];
    for (const key of items) {
        const render = renderers[key];
        if (!render) continue;
        const node = render();
        if (!node) continue;
        if (parts.length > 0) parts.push(<Text key={`sep-${key}`} dimColor> · </Text>);
        parts.push(<React.Fragment key={key}>{node}</React.Fragment>);
    }

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box>
                <Text dimColor>── </Text>
                {parts}
                <Text dimColor> ──</Text>
            </Box>
            {health !== 'healthy' && (
                <Text color={color}>
                    {'   '}Context {health === 'warning' ? `at ${usagePercent}%` : `${health} (${usagePercent}%)`}
                </Text>
            )}
        </Box>
    );
};

export default StatusBar;
