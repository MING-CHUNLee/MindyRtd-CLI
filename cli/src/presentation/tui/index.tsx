import React from 'react';
import { render } from 'ink';
import App from './App.js';

export const startTUI = () => {
    const { waitUntilExit } = render(<App />);
    return waitUntilExit();
};

// Start the TUI when this file is executed
startTUI();
