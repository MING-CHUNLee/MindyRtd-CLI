/**
 * CLI Error Classes
 * 
 * Simple error classes for CLI-level error handling.
 */

export class CLIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CLIError';
    }
}

export class DirectoryNotFoundError extends CLIError {
    constructor(public readonly path: string) {
        super(`Directory not found: ${path}`);
        this.name = 'DirectoryNotFoundError';
    }
}

export class InvalidDirectoryError extends CLIError {
    constructor(public readonly path: string) {
        super(`Path is not a directory: ${path}`);
        this.name = 'InvalidDirectoryError';
    }
}

export class RNotFoundError extends CLIError {
    constructor() {
        super('R is not installed or not accessible in PATH. Please install R and ensure Rscript is available.');
        this.name = 'RNotFoundError';
    }
}

export class LibraryScanError extends CLIError {
    constructor(message: string) {
        super(message);
        this.name = 'LibraryScanError';
    }
}

// ============================================
// R Code Execution Errors
// ============================================

export class RExecutionError extends CLIError {
    constructor(message: string, public readonly code?: string) {
        super(message);
        this.name = 'RExecutionError';
    }
}

export class PlumberConnectionError extends CLIError {
    constructor(public readonly host: string, public readonly port: number) {
        super(`Cannot connect to Plumber API at ${host}:${port}`);
        this.name = 'PlumberConnectionError';
    }
}

export class PlumberTimeoutError extends CLIError {
    constructor(public readonly timeoutMs: number) {
        super(`Execution timed out after ${timeoutMs}ms`);
        this.name = 'PlumberTimeoutError';
    }
}

export class CodeFileNotFoundError extends CLIError {
    constructor(public readonly filePath: string) {
        super(`R file not found: ${filePath}`);
        this.name = 'CodeFileNotFoundError';
    }
}

export class ExecutionRejectedError extends CLIError {
    constructor() {
        super('Code execution was rejected by user');
        this.name = 'ExecutionRejectedError';
    }
}
