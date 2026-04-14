/**
 * InstallReview Component
 *
 * Displays the pre-flight install plan (packages to install, already-installed,
 * blocked, and warnings) and captures Y/N key press for user confirmation.
 * Mirrors the DiffReview pattern for consistency.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { PendingInstall } from '../types.js';

interface InstallReviewProps {
    plan: PendingInstall;
    onDecision: (approved: boolean) => void;
}

const InstallReview: React.FC<InstallReviewProps> = ({ plan, onDecision }) => {
    useInput((input: string, key: { return?: boolean; escape?: boolean }) => {
        const lower = input.toLowerCase();
        if (lower === 'y' || key.return) {
            onDecision(true);
        } else if (lower === 'n' || key.escape) {
            onDecision(false);
        }
    });

    return (
        <Box flexDirection="column" marginY={1}>
            <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
                <Text bold color="cyan">Package Installation Plan</Text>

                {plan.toInstall.length > 0 && (
                    <Box marginTop={1} flexDirection="column">
                        <Text color="green" bold>To install ({plan.toInstall.length}):</Text>
                        {plan.toInstall.map(pkg => (
                            <Text key={pkg} color="white">  • {pkg}</Text>
                        ))}
                    </Box>
                )}

                {plan.alreadyInstalled.length > 0 && (
                    <Box marginTop={1} flexDirection="column">
                        <Text color="gray">Already installed (will skip):</Text>
                        <Text color="gray">  {plan.alreadyInstalled.join(', ')}</Text>
                    </Box>
                )}

                {plan.warnings.length > 0 && (
                    <Box marginTop={1} flexDirection="column">
                        <Text color="yellow" bold>Warnings:</Text>
                        {plan.warnings.map(w => (
                            <Text key={w.name} color="yellow">  ⚠  {w.name}: {w.message}</Text>
                        ))}
                    </Box>
                )}

                {plan.blocked.length > 0 && (
                    <Box marginTop={1} flexDirection="column">
                        <Text color="red" bold>Blocked (will skip):</Text>
                        {plan.blocked.map(b => (
                            <Text key={b.name} color="red">  ✗  {b.name}: {b.reason}</Text>
                        ))}
                    </Box>
                )}

                <Box marginTop={1}>
                    <Text color="cyan" bold>
                        Proceed with installation? [Y] Accept  [N] Cancel
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};

export default InstallReview;
