import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Header from './components/Header.js';
import Footer from './components/Footer.js';
import ChatHistory from './components/ChatHistory.js';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const App: React.FC = () => {
    const { exit } = useApp();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Welcome to Mindy CLI Interactive Mode! Type your message and press Enter.',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Handle keyboard shortcuts
    useInput((input, key) => {
        if (key.escape || (key.ctrl && input === 'c')) {
            exit();
        }
    });

    const handleSubmit = async (userInput: string) => {
        if (!userInput.trim() || isProcessing) return;

        // Add user message
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userInput,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);

        // Simulate AI response (replace with actual R execution later)
        setTimeout(() => {
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Echo: ${userInput}`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            setIsProcessing(false);
        }, 1000);
    };

    return (
        <Box flexDirection="column" height="100%">
            <Header messageCount={messages.length} />

            <Box flexGrow={1} flexDirection="column" paddingX={2}>
                <ChatHistory messages={messages} />
            </Box>

            <Footer
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
            />
        </Box>
    );
};

export default App;
