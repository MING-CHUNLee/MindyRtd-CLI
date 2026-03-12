/**
 * ThinkingIndicator Component
 *
 * Animated "Thinking..." dots rendered in Ink.
 */

import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface ThinkingIndicatorProps {
    label?: string;
}

const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ label = 'Thinking' }) => {
    const [dots, setDots] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setDots(d => (d + 1) % 4);
        }, 300);
        return () => clearInterval(timer);
    }, []);

    return (
        <Text color="yellow" dimColor>
            {label}{'.'.repeat(dots)}
        </Text>
    );
};

export default ThinkingIndicator;
