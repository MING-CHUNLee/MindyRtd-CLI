/**
 * TUI Message Types
 *
 * Extended message types for the interactive REPL TUI.
 */

import {
    ScanResultVM,
    LibraryScanResultVM,
} from '../../shared/view-models/index.js';
import { RExecResultVM, RInstallResultVM } from './view-models/index.js';

export type MessageType =
    | 'user'
    | 'assistant'
    | 'thinking'
    | 'tool_call'
    | 'observation'
    | 'diff'
    | 'status'
    | 'error'
    | 'tool_result';

/**
 * Identifies which Ink component should render a tool_result message.
 */
export type ToolResultRenderer = 'scan' | 'library' | 'context' | 'r_exec' | 'r_install';

/**
 * Union of all structured VMs that can appear in a tool_result message.
 */
export type ToolResultVM =
    | ScanResultVM
    | LibraryScanResultVM
    | RExecResultVM
    | RInstallResultVM;

export interface TUIMessage {
    id: string;
    type: MessageType;
    content: string;
    timestamp: Date;
    /** Set when type === 'tool_result'. Selects the Ink component in ChatHistory. */
    renderer?: ToolResultRenderer;
    /** Structured VM payload — only present when type === 'tool_result'. */
    vm?: ToolResultVM;
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

export interface PendingInstall {
    toInstall: string[];
    alreadyInstalled: string[];
    blocked: Array<{ name: string; reason: string }>;
    warnings: Array<{ name: string; message: string }>;
}

export interface TUIConfig {
    directory: string;
    sessionId?: string;
    forceNew?: boolean;
}
