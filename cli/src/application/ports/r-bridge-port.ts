/**
 * Application Port: RBridgePort
 *
 * Minimal contract for interacting with the RStudio-side listener.
 * Application layer depends on this interface; infrastructure provides the implementation.
 */

import type { ExecutionResponse } from '../../shared/types/execution';

export interface RBridgePort {
    isListenerRunning(): boolean;
    runCurrentFile(): Promise<ExecutionResponse>;
    getCurrentFile(): Promise<string | null>;
}
