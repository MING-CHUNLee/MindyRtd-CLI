/**
 * StatusBar Component
 *
 * Ink version of ContextStatusBar — renders session health inline in the TUI.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
    sessionId: string;
    turnCount: number;
    model: string;
    usagePercent: number;
    health: 'healthy' | 'warning' | 'critical' | 'overflow_risk';
    totalCostUSD: number;
}

const BAR_WIDTH = 20;

function healthColor(health: string): string {
    switch (health) {
        case 'healthy': return 'green';
        case 'warning': return 'yellow';
        case 'critical': return 'red';
        case 'overflow_risk': return 'red';
        default: return 'gray';
    }
}

const StatusBar: React.FC<StatusBarProps> = ({
    sessionId,
    turnCount,
    model,
    usagePercent,
    health,
    totalCostUSD,
}) => {
    const filled = Math.round((usagePercent / 100) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
    const color = healthColor(health);

    return (
        <Box flexDirection="column" paddingX={1}>
            <Text dimColor>{'─'.repeat(50)}</Text>
            <Box>
                <Text dimColor>
                    #{sessionId.slice(-6)} turn {turnCount} · {model}
                </Text>
            </Box>
            <Box>
                <Text dimColor>Context </Text>
                <Text color={color}>{bar}</Text>
                <Text color={color}> {usagePercent}%</Text>
                <Text dimColor> · ~${totalCostUSD.toFixed(4)}</Text>
            </Box>
            <Text dimColor>{'─'.repeat(50)}</Text>
        </Box>
    );
};

export default StatusBar;
