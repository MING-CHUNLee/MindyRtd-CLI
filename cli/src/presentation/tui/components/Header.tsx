import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
    messageCount: number;
}

const Header: React.FC<HeaderProps> = ({ messageCount }) => {
    const now = new Date().toLocaleTimeString();

    return (
        <Box
            borderStyle="round"
            borderColor="cyan"
            paddingX={2}
            paddingY={0}
            flexDirection="column"
        >
            <Box justifyContent="space-between">
                <Text bold color="cyan">
                    🤖 Mindy CLI - Interactive Mode
                </Text>
                <Text color="gray">
                    {now}
                </Text>
            </Box>
            <Box justifyContent="space-between">
                <Text color="green">
                    Status: Ready
                </Text>
                <Text color="gray">
                    Messages: {messageCount}
                </Text>
            </Box>
        </Box>
    );
};

export default Header;
