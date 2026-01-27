import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface FooterProps {
    input: string;
    onInputChange: (value: string) => void;
    onSubmit: (value: string) => void;
    isProcessing: boolean;
}

const Footer: React.FC<FooterProps> = ({
    input,
    onInputChange,
    onSubmit,
    isProcessing,
}) => {
    return (
        <Box flexDirection="column">
            <Box
                borderStyle="round"
                borderColor="magenta"
                paddingX={2}
                paddingY={0}
            >
                <Box width="100%">
                    <Text color="magenta" bold>
                        {'> '}
                    </Text>
                    {isProcessing ? (
                        <Text color="yellow">Processing...</Text>
                    ) : (
                        <TextInput
                            value={input}
                            onChange={onInputChange}
                            onSubmit={onSubmit}
                            placeholder="Type your message here..."
                        />
                    )}
                </Box>
            </Box>
            <Box paddingX={2}>
                <Text color="gray" dimColor>
                    Press <Text color="yellow">ESC</Text> or{' '}
                    <Text color="yellow">Ctrl+C</Text> to exit
                </Text>
            </Box>
        </Box>
    );
};

export default Footer;
