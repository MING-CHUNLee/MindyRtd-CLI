/**
 * StreamingMessage Component
 *
 * Renders accumulated streaming tokens with a blinking cursor.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface StreamingMessageProps {
    content: string;
}

const StreamingMessage: React.FC<StreamingMessageProps> = ({ content }) => {
    const [showCursor, setShowCursor] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => {
            setShowCursor(v => !v);
        }, 500);
        return () => clearInterval(timer);
    }, []);

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text bold color="green">
                {'🤖 Assistant'}
            </Text>
            <Box paddingLeft={3}>
                <Text color="green">
                    {content}{showCursor ? '▊' : ' '}
                </Text>
            </Box>
        </Box>
    );
};

export default StreamingMessage;
