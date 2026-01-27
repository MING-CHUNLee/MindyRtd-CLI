import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '../App.js';

interface ChatHistoryProps {
    messages: Message[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
    return (
        <Box flexDirection="column" paddingY={1}>
            {messages.map((message) => (
                <Box key={message.id} flexDirection="column" marginBottom={1}>
                    <Box>
                        <Text
                            bold
                            color={message.role === 'user' ? 'blue' : 'green'}
                        >
                            {message.role === 'user' ? '👤 You' : '🤖 Assistant'}
                        </Text>
                        <Text color="gray" dimColor>
                            {' '}
                            - {message.timestamp.toLocaleTimeString()}
                        </Text>
                    </Box>
                    <Box paddingLeft={3}>
                        <Text>{message.content}</Text>
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

export default ChatHistory;
