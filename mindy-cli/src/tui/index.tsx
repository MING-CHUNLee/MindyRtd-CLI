import React from 'react';
import { render } from 'ink';
import App from './controller/AppController.js';
import { TUIConfig } from './presentation/types.js';

export const startTUI = (config?: TUIConfig) => {
    const { waitUntilExit } = render(<App config={config} />);
    return waitUntilExit();
};
