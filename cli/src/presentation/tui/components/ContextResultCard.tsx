import React from 'react';
import { Box, Text } from 'ink';
import { ContextDisplayVM } from '../../view-models/index.js';

interface ContextResultCardProps {
    vm: ContextDisplayVM;
}

const ContextResultCard: React.FC<ContextResultCardProps> = ({ vm }) => {
    const { summary, prompt, warnings } = vm;

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} marginY={1}>
            <Text bold color="magenta">🔍 Project Context</Text>

            <Box flexDirection="column" marginTop={1}>
                <Text>
                    <Text dimColor>Project:  </Text>
                    <Text>{summary.projectName}</Text>
                </Text>
                <Text>
                    <Text dimColor>R:        </Text>
                    <Text>{summary.rVersion}</Text>
                </Text>
                <Text>
                    <Text dimColor>Files:    </Text>
                    <Text>{summary.totalFiles}  </Text>
                    <Text dimColor>(R: {summary.fileTypes.rScripts}  Rmd: {summary.fileTypes.rMarkdown}  Data: {summary.fileTypes.rData})</Text>
                </Text>
                <Text>
                    <Text dimColor>Packages: </Text>
                    <Text>{summary.totalPackages}</Text>
                    {summary.keyPackages.length > 0 && (
                        <Text dimColor>  — {summary.keyPackages.slice(0, 5).join(', ')}</Text>
                    )}
                </Text>
            </Box>

            {!vm.options.showSummaryOnly && (
                <Box flexDirection="column" marginTop={1}>
                    <Text dimColor>Tokens: ~{prompt.estimatedTokens.toLocaleString()}  ({prompt.charCount.toLocaleString()} chars)</Text>
                </Box>
            )}

            {warnings.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    {warnings.map((w, i) => (
                        <Text key={i} color="yellow">⚠  {w}</Text>
                    ))}
                </Box>
            )}
        </Box>
    );
};

export default ContextResultCard;
