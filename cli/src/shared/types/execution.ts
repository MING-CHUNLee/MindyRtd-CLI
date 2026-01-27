/**
 * Types for R code execution via Plumber API
 */

// ============================================
// Execution Request/Response Types
// ============================================

export interface ExecutionRequest {
    /** R code to execute */
    code: string;
    /** Whether confirmation is required before execution */
    confirmRequired?: boolean;
    /** Execution timeout in milliseconds */
    timeout?: number;
}

export interface ExecutionResponse {
    /** Unique execution ID */
    id: string;
    /** Current status */
    status: ExecutionStatus;
    /** Execution output (stdout) */
    output?: string;
    /** Error message if failed */
    error?: string;
    /** Execution duration in milliseconds */
    duration?: number;
}

export type ExecutionStatus =
    | 'pending'      // Waiting for confirmation
    | 'running'      // Currently executing
    | 'completed'    // Successfully completed
    | 'error'        // Execution failed
    | 'rejected'     // User rejected execution
    | 'timeout';     // Execution timed out

// ============================================
// Plumber API Types
// ============================================

export interface PlumberStatus {
    /** Whether the API is running */
    running: boolean;
    /** R session ID */
    sessionId?: string;
    /** R version */
    rVersion?: string;
    /** API uptime in seconds */
    uptime?: number;
}

export interface PlumberConfig {
    /** API host */
    host: string;
    /** API port */
    port: number;
    /** Request timeout in milliseconds */
    timeout: number;
}

// ============================================
// Run Command Types
// ============================================

export interface RunCommandOptions {
    /** Skip confirmation prompt */
    yes: boolean;
    /** Plumber API port */
    port: number;
    /** Execution timeout in milliseconds */
    timeout: number;
    /** Output as JSON */
    json: boolean;
}

export interface CodeSource {
    /** Source type */
    type: 'inline' | 'file';
    /** The R code content */
    code: string;
    /** Original file path (if type is 'file') */
    filePath?: string;
}

// ============================================
// Factory Functions
// ============================================

export function createPlumberConfig(
    options?: Partial<PlumberConfig>
): PlumberConfig {
    return {
        host: options?.host ?? 'localhost',
        port: options?.port ?? 8787,
        timeout: options?.timeout ?? 30000,
    };
}

export function createExecutionRequest(
    code: string,
    options?: Partial<Omit<ExecutionRequest, 'code'>>
): ExecutionRequest {
    return {
        code,
        confirmRequired: options?.confirmRequired ?? true,
        timeout: options?.timeout,
    };
}
