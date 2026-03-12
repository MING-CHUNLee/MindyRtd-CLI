import React from 'react';
import { render } from 'ink';
import App from './App.js';
import { TUIConfig } from './types.js';

export const startTUI = (config?: TUIConfig) => {
    const { waitUntilExit } = render(<App config={config} />);
    return waitUntilExit();
};

// Start the TUI when this file is executed directly
// Use path.sep-agnostic check (Windows uses backslashes)
const scriptPath = process.argv[1]?.replace(/\\/g, '/') ?? '';
const isDirectRun = scriptPath.includes('tui/index');
if (isDirectRun) {
    startTUI({ directory: process.cwd() });
}
