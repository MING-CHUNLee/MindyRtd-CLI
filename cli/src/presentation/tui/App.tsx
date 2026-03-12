import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Header from './components/Header.js';
import Footer from './components/Footer.js';
import ChatHistory from './components/ChatHistory.js';
import DiffReview from './components/DiffReview.js';
import StatusBar from './components/StatusBar.js';
import ThinkingIndicator from './components/ThinkingIndicator.js';
import StreamingMessage from './components/StreamingMessage.js';
import { TUIMessage, AppState, PendingEdit, TUIConfig } from './types.js';

// Type-only imports (erased at runtime — avoids ESM/CJS interop issues)
// The actual AgentService class is loaded via dynamic import() in useEffect.
type AgentEvent = { type: string; data: Record<string, unknown> };
type ProposedEdit = { path: string; diff: string; original: string; proposed: string };

// Re-export for backward compat
export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface AppProps {
    config?: TUIConfig;
}

let msgCounter = 0;
function nextId(): string {
    return `msg-${Date.now()}-${++msgCounter}`;
}

const App: React.FC<AppProps> = ({ config }) => {
    const { exit } = useApp();
    const [messages, setMessages] = useState<TUIMessage[]>([
        {
            id: nextId(),
            type: 'status',
            content: 'Welcome to Mindy CLI! Type your instruction and press Enter. /help for commands.',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [appState, setAppState] = useState<AppState>('idle');
    const [pendingReview, setPendingReview] = useState<PendingEdit | null>(null);
    const [streamingContent, setStreamingContent] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [statusData, setStatusData] = useState<{
        sessionId: string; turnCount: number; model: string;
        usagePercent: number; health: 'healthy' | 'warning' | 'critical' | 'overflow_risk';
        totalCostUSD: number;
    } | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentServiceRef = useRef<any>(null);
    const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);

    // Helper to add a message
    const addMessage = useCallback((type: TUIMessage['type'], content: string, metadata?: TUIMessage['metadata']) => {
        setMessages(prev => [...prev, {
            id: nextId(),
            type,
            content,
            timestamp: new Date(),
            metadata,
        }]);
    }, []);

    // Event handler for AgentService
    const handleAgentEvent = useCallback((event: AgentEvent) => {
        switch (event.type) {
            case 'session_loaded': {
                const { sessionId, turnCount, model } = event.data as { sessionId: string; turnCount: number; model: string };
                if (turnCount > 0) {
                    addMessage('status', `Resumed session ${(sessionId as string).slice(-6)} (${turnCount} previous turns) · ${model}`);
                } else {
                    addMessage('status', `New session ${(sessionId as string).slice(-6)} · ${model}`);
                }
                break;
            }
            case 'intent_classified':
                addMessage('status', `Intent: ${event.data.intent}`);
                break;
            case 'phase_start':
                addMessage('status', `${event.data.description}...`);
                break;
            case 'phase_end':
                if (event.data.summary) {
                    addMessage('status', event.data.summary as string);
                }
                break;
            case 'react_step': {
                const { thought, action, observation } = event.data;
                if (thought) addMessage('thinking', (thought as string).slice(0, 200));
                if (action) addMessage('tool_call', `${(action as { tool: string }).tool}`);
                if (observation) addMessage('observation', (observation as string).slice(0, 150));
                break;
            }
            case 'text_output': {
                // Finalize any streaming content first
                setIsStreaming(false);
                setStreamingContent('');
                addMessage('assistant', event.data.content as string);
                break;
            }
            case 'stream_token': {
                setIsStreaming(true);
                setStreamingContent(prev => prev + (event.data.token as string));
                break;
            }
            case 'diff_proposed': {
                const edit = event.data as unknown as ProposedEdit;
                setPendingReview({
                    path: edit.path,
                    diff: edit.diff,
                    original: edit.original,
                    proposed: edit.proposed,
                });
                setAppState('reviewing');
                break;
            }
            case 'edit_applied':
                addMessage('status', `Applied: ${event.data.path}`);
                break;
            case 'edit_rejected':
                addMessage('status', `Rejected: ${event.data.path}`);
                break;
            case 'turn_saved': {
                const d = event.data as {
                    sessionId: string; turnCount: number; model: string;
                    usagePercent: number; health: string; totalCostUSD: number;
                };
                setStatusData({
                    sessionId: d.sessionId,
                    turnCount: d.turnCount as number,
                    model: d.model as string,
                    usagePercent: d.usagePercent as number,
                    health: d.health as 'healthy' | 'warning' | 'critical' | 'overflow_risk',
                    totalCostUSD: d.totalCostUSD as number,
                });
                break;
            }
            case 'status_update':
                if (event.data.plugins) {
                    addMessage('status', `Plugins: ${(event.data.plugins as string[]).join(', ')}`);
                }
                if (event.data.knowledge) {
                    addMessage('status', `Knowledge: ${(event.data.knowledge as string[]).join(', ')}`);
                }
                break;
            case 'error':
                addMessage('error', `[${event.data.phase}] ${event.data.message}`);
                break;
        }
    }, [addMessage]);

    // Approval callback — suspends agent until user decides
    const onApproval = useCallback(async (_edit: ProposedEdit): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            approvalResolverRef.current = resolve;
        });
    }, []);

    // Handle review decision from DiffReview component
    const handleReviewDecision = useCallback((approved: boolean) => {
        approvalResolverRef.current?.(approved);
        approvalResolverRef.current = null;
        setPendingReview(null);
        setAppState('processing');
    }, []);

    // Initialize AgentService on mount via dynamic import
    // (dynamic import avoids ESM/CJS named-export mismatch at module load time)
    useEffect(() => {
        const initAgent = async () => {
            const mod = await import('../../application/services/agent-service.js');
            // CJS default export wraps all named exports
            const AgentServiceClass = mod.AgentService ?? mod.default?.AgentService;
            const service = new AgentServiceClass(
                { directory: config?.directory ?? process.cwd() },
                handleAgentEvent,
                onApproval,
            );
            await service.initialize({
                sessionId: config?.sessionId,
                forceNew: config?.forceNew,
            });
            agentServiceRef.current = service;
        };
        initAgent().catch(err => {
            addMessage('error', `Failed to initialize agent: ${err.message ?? err}`);
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle keyboard shortcuts
    useInput((input: string, key: { escape?: boolean; ctrl?: boolean; return?: boolean }) => {
        if (appState === 'idle' && (key.escape || (key.ctrl && input === 'c'))) {
            exit();
        }
    });

    // Submit handler
    const handleSubmit = useCallback(async (userInput: string) => {
        if (!userInput.trim() || appState !== 'idle') return;

        const service = agentServiceRef.current;
        if (!service) {
            addMessage('error', 'Agent not initialized yet. Please wait...');
            return;
        }

        addMessage('user', userInput);
        setInput('');

        // Handle slash commands
        if (userInput.startsWith('/')) {
            if (userInput.trim() === '/exit') {
                exit();
                return;
            }
            const result = await service.handleSlashCommand(userInput.trim());
            addMessage('assistant', result);
            return;
        }

        // Run agent
        setAppState('processing');
        setStreamingContent('');
        setIsStreaming(false);

        try {
            await service.executeInstruction(userInput);
        } catch (err) {
            addMessage('error', `Agent error: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Finalize streaming if any
        if (isStreaming) {
            setIsStreaming(false);
            setStreamingContent('');
        }

        setAppState('idle');
    }, [appState, addMessage, exit, isStreaming]);

    return (
        <Box flexDirection="column" height="100%">
            <Header messageCount={messages.length} />

            <Box flexGrow={1} flexDirection="column" paddingX={2}>
                <ChatHistory messages={messages} />

                {isStreaming && streamingContent && (
                    <StreamingMessage content={streamingContent} />
                )}

                {appState === 'processing' && !isStreaming && (
                    <ThinkingIndicator />
                )}

                {appState === 'reviewing' && pendingReview && (
                    <DiffReview
                        edit={pendingReview}
                        onDecision={handleReviewDecision}
                    />
                )}
            </Box>

            {statusData && (
                <StatusBar
                    sessionId={statusData.sessionId}
                    turnCount={statusData.turnCount}
                    model={statusData.model}
                    usagePercent={statusData.usagePercent}
                    health={statusData.health}
                    totalCostUSD={statusData.totalCostUSD}
                />
            )}

            <Footer
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                appState={appState}
            />
        </Box>
    );
};

export default App;
