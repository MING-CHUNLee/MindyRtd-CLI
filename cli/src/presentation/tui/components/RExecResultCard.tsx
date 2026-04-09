import React from 'react';
import { Box, Text } from 'ink';
import { RExecResultVM } from '../../view-models/index.js';

interface RExecResultCardProps {
    vm: RExecResultVM;
}

const MAX_OUTPUT_LINES = 20;

function truncateOutput(text: string, maxLines: number): { lines: string[]; truncated: boolean } {
    const lines = text.split('\n');
    if (lines.length <= maxLines) return { lines, truncated: false };
    return { lines: lines.slice(0, maxLines), truncated: true };
}

const RExecResultCard: React.FC<RExecResultCardProps> = ({ vm }) => {
    const { lines: stdoutLines, truncated: stdoutTruncated } = truncateOutput(vm.stdout, MAX_OUTPUT_LINES);
    const hasStderr = vm.stderr.trim().length > 0;

    return (
        <Box flexDirection="column" borderStyle="round" borderColor={vm.success ? 'cyan' : 'red'} paddingX={1} marginY={1}>
            <Text bold color={vm.success ? 'cyan' : 'red'}>
                {vm.success ? '✓' : '✗'} R Exec  <Text dimColor>exit {vm.exitCode}</Text>
            </Text>
            <Text dimColor>$ {vm.command}</Text>

            {vm.stdout.trim().length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    {stdoutLines.map((line, i) => (
                        <Text key={i}>{line}</Text>
                    ))}
                    {stdoutTruncated && (
                        <Text dimColor>... output truncated ({vm.stdout.split('\n').length} lines total)</Text>
                    )}
                </Box>
            )}

            {hasStderr && (
                <Box flexDirection="column" marginTop={1}>
                    <Text color="yellow">stderr:</Text>
                    <Text color="yellow" dimColor>{vm.stderr.trim()}</Text>
                </Box>
            )}
        </Box>
    );
};

export default RExecResultCard;
