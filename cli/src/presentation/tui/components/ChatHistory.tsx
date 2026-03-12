import React from 'react';
import { Box, Text } from 'ink';
import { TUIMessage } from '../types.js';

interface ChatHistoryProps {
    messages: TUIMessage[];
}

function messageColor(type: TUIMessage['type']): string {
    switch (type) {
        case 'user': return 'blue';
        case 'assistant': return 'green';
        case 'thinking': return 'gray';
        case 'tool_call': return 'cyan';
        case 'observation': return 'gray';
        case 'diff': return 'yellow';
        case 'status': return 'magenta';
        case 'error': return 'red';
        default: return 'white';
    }
}

function messagePrefix(type: TUIMessage['type']): string {
    switch (type) {
        case 'user': return '> ';
        case 'assistant': return '🤖 ';
        case 'thinking': return '💭 ';
        case 'tool_call': return '🔧 ';
        case 'observation': return '   <- ';
        case 'diff': return '📄 ';
        case 'status': return '  ';
        case 'error': return '❌ ';
        default: return '';
    }
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
    return (
        <Box flexDirection="column" paddingY={1}>
            {messages.map((message) => (
                <Box key={message.id} flexDirection="column" marginBottom={message.type === 'user' || message.type === 'assistant' ? 1 : 0}>
                    <Box>
                        <Text
                            color={messageColor(message.type)}
                            dimColor={message.type === 'thinking' || message.type === 'observation' || message.type === 'status'}
                            bold={message.type === 'user' || message.type === 'assistant' || message.type === 'error'}
                        >
                            {messagePrefix(message.type)}{message.content}
                        </Text>
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

export default ChatHistory;
