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
