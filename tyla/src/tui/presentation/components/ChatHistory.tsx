import React from 'react';
import { Box, Text } from 'ink';
import { TUIMessage, ToolResultRenderer, ToolResultVM } from '../types.js';
import ScanResultCard     from './ScanResultCard.js';
import LibraryResultCard  from './LibraryResultCard.js';
import RExecResultCard    from './RExecResultCard.js';
import RInstallResultCard from './RInstallResultCard.js';
import {
    ScanResultVM,
    LibraryScanResultVM,
    RExecResultVM,
    RInstallResultVM,
} from '../../../shared/view-models/index.js';

interface ChatHistoryProps {
    messages: TUIMessage[];
}

function renderToolResult(renderer: ToolResultRenderer, vm: ToolResultVM): React.ReactNode {
    switch (renderer) {
        case 'scan':       return <ScanResultCard     vm={vm as ScanResultVM} />;
        case 'library':    return <LibraryResultCard  vm={vm as LibraryScanResultVM} />;
        case 'r_exec':     return <RExecResultCard    vm={vm as RExecResultVM} />;
        case 'r_install':  return <RInstallResultCard vm={vm as RInstallResultVM} />;
    }
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
            {messages.map((message) => {
                if (message.type === 'tool_result' && message.renderer && message.vm) {
                    return (
                        <Box key={message.id}>
                            {renderToolResult(message.renderer, message.vm)}
                        </Box>
                    );
                }
                return (
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
                );
            })}
        </Box>
    );
};

export default ChatHistory;
