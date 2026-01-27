#!/usr/bin/env node
import React from 'react';
import { render, Box, Text } from 'ink';

const TestApp = () => (
    <Box borderStyle="round" borderColor="green" padding={1}>
        <Text color="cyan" bold>
            🎉 TUI Test Successful!
        </Text>
    </Box>
);

render(<TestApp />);
