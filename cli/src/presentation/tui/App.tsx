import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useInput, useApp } from 'ink';
import Header from './components/Header.js';
import Footer from './components/Footer.js';
import ChatHistory from './components/ChatHistory.js';
import DiffReview from './components/DiffReview.js';
import StatusBar from './components/StatusBar.js';
import ThinkingIndicator from './components/ThinkingIndicator.js';
import StreamingMessage from './components/StreamingMessage.js';
import { TUIMessage, AppState, PendingEdit, TUIConfig } from './types.js';
import { mapAgentEventToMessage, AgentEvent, ProposedEdit, nextId } from './event-mapper.js';
import { StatusBarVM, StatusBarDisplayConfig } from '../view-models/index.js';

// Type-only — erased at runtime (avoids ESM/CJS interop issues at module load).
// AgentService is loaded via dynamic import() in useEffect.

interface AppProps {
    config?: TUIConfig;
}

const DEFAULT_STATUS_CONFIG: StatusBarDisplayConfig = {
    items: ['model', 'context', 'turn', 'cost'],
};

function makeStatusMessage(content: string): TUIMessage {
    return { id: nextId(), type: 'status', content, timestamp: new Date() };
}

// ──────────────────────────────────────────────────────────────────────────────

const App: React.FC<AppProps> = ({ config }) => {
    const { exit } = useApp();

    const [messages, setMessages] = useState<TUIMessage[]>([
        makeStatusMessage('Welcome to Mindy CLI! Type your instruction and press Enter. /help for commands.'),
    ]);
    const [input, setInput]           = useState('');
    const [appState, setAppState]     = useState<AppState>('idle');
    const [pendingReview, setPendingReview] = useState<PendingEdit | null>(null);
    const [streamingContent, setStreamingContent] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [statusData, setStatusData] = useState<StatusBarVM | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentServiceRef     = useRef<any>(null);
    const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);

    // ── Message helpers ───────────────────────────────────────────────────

    const addMessage = useCallback((msg: TUIMessage) => {
        setMessages(prev => [...prev, msg]);
    }, []);

    const addStatusMessage = useCallback((content: string) => {
        addMessage(makeStatusMessage(content));
    }, [addMessage]);

    // ── Agent event handler ───────────────────────────────────────────────
    // Delegates all mapping to the pure event-mapper module.

    const handleAgentEvent = useCallback((event: AgentEvent) => {
        const { message, sideEffect } = mapAgentEventToMessage(event);

        if (message) addMessage(message);

        if (sideEffect) {
            if (sideEffect.finalizeStream) {
                setIsStreaming(false);
                setStreamingContent('');
            }
            if (sideEffect.streamingToken !== undefined) {
                setIsStreaming(true);
                setStreamingContent(prev => prev + sideEffect.streamingToken);
            }
            if (sideEffect.pendingReview) {
                setPendingReview(sideEffect.pendingReview);
                setAppState('reviewing');
            }
            if (sideEffect.nextAppState && sideEffect.nextAppState !== 'reviewing') {
                setAppState(sideEffect.nextAppState);
            }
            if (sideEffect.statusData) {
                setStatusData(sideEffect.statusData);
            }
        }
    }, [addMessage]);

    // ── Approval callback — suspends agent until user decides ─────────────

    const onApproval = useCallback(async (_edit: ProposedEdit): Promise<boolean> => {
        return new Promise<boolean>(resolve => {
            approvalResolverRef.current = resolve;
        });
    }, []);

    const handleReviewDecision = useCallback((approved: boolean) => {
        approvalResolverRef.current?.(approved);
        approvalResolverRef.current = null;
        setPendingReview(null);
        setAppState('processing');
    }, []);

    // ── Agent initialization (dynamic import avoids ESM/CJS mismatch) ────

    useEffect(() => {
        const initAgent = async () => {
            const [mod, factoryMod] = await Promise.all([
                import('../../application/controllers/agent-controller.js'),
                import('../../infrastructure/bootstrap/agent-factory.js'),
            ]);
            const AgentServiceClass = mod.AgentController;
            const service = new AgentServiceClass(
                { directory: config?.directory ?? process.cwd() },
                handleAgentEvent,
                onApproval,
                factoryMod.buildAgentDeps(),
            );
            await service.initialize({
                sessionId: config?.sessionId,
                forceNew:  config?.forceNew,
            });
            agentServiceRef.current = service;
        };
        initAgent().catch(err => {
            const isApiKeyError =
                err.message?.includes('No API key found') || err.message?.includes('API key');
            const content = isApiKeyError
                ? err.message
                : `Failed to initialize agent: ${err.message ?? err}`;
            addMessage({ id: nextId(), type: 'error', content, timestamp: new Date() });
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keyboard shortcuts ────────────────────────────────────────────────

    useInput((input: string, key: { escape?: boolean; ctrl?: boolean }) => {
        if (appState === 'idle' && (key.escape || (key.ctrl && input === 'c'))) {
            exit();
        }
    });

    // ── Submit handler ────────────────────────────────────────────────────

    const handleSubmit = useCallback(async (userInput: string) => {
        if (!userInput.trim() || appState !== 'idle') return;

        const service = agentServiceRef.current;
        if (!service) {
            addStatusMessage('Agent is not ready. Please check your .env file has a valid API key and restart mindy-cli.');
            return;
        }

        addMessage({ id: nextId(), type: 'user', content: userInput, timestamp: new Date() });
        setInput('');

        // Slash commands
        if (userInput.startsWith('/')) {
            if (userInput.trim() === '/exit') { exit(); return; }
            const result = await service.handleSlashCommand(userInput.trim());
            addMessage({ id: nextId(), type: 'assistant', content: result, timestamp: new Date() });
            return;
        }

        // Run agent
        setAppState('processing');
        setStreamingContent('');
        setIsStreaming(false);

        try {
            await service.executeInstruction(userInput);
        } catch (err) {
            addMessage({
                id: nextId(), type: 'error',
                content: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
                timestamp: new Date(),
            });
        }

        setIsStreaming(false);
        setStreamingContent('');
        setAppState('idle');
    }, [appState, addMessage, addStatusMessage, exit]);

    // ── Render ────────────────────────────────────────────────────────────

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
                <StatusBar vm={statusData} config={DEFAULT_STATUS_CONFIG} />
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
