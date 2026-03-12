/**
 * TUI Message Types
 *
 * Extended message types for the interactive REPL TUI.
 */

export type MessageType =
    | 'user'
    | 'assistant'
    | 'thinking'
    | 'tool_call'
    | 'observation'
    | 'diff'
    | 'status'
    | 'error';

export interface TUIMessage {
    id: string;
    type: MessageType;
    content: string;
    timestamp: Date;
    metadata?: {
        toolName?: string;
        filePath?: string;
        diffContent?: string;
        original?: string;
        proposed?: string;
        approved?: boolean;
    };
}

export type AppState = 'idle' | 'processing' | 'reviewing';

export interface PendingEdit {
    path: string;
    diff: string;
    original: string;
    proposed: string;
}

export interface TUIConfig {
    directory: string;
    sessionId?: string;
    forceNew?: boolean;
}
