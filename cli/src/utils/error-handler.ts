/**
 * Unified Error Handler
 *
 * Provides centralized error handling for CLI operations.
 * Handles error formatting, logging, and exit codes.
 */

import chalk from 'chalk';
import { CLIError, DirectoryNotFoundError, InvalidDirectoryError, RNotFoundError, LibraryScanError } from './errors';

// ============================================
// Types
// ============================================

export interface ErrorHandlerOptions {
    /** Show stack trace in output */
    showStack?: boolean;
    /** Exit process on error */
    exitOnError?: boolean;
    /** Custom exit code */
    exitCode?: number;
}

export interface FormattedError {
    /** Error type/name */
    type: string;
    /** User-friendly message */
    message: string;
    /** Suggested action to fix */
    suggestion?: string;
    /** Exit code for process */
    exitCode: number;
}

// ============================================
// Error Suggestions Map
// ============================================

const ERROR_SUGGESTIONS: Record<string, string> = {
    DirectoryNotFoundError: 'Please check the path and ensure the directory exists.',
    InvalidDirectoryError: 'Please provide a valid directory path, not a file.',
    RNotFoundError: 'Install R from https://cran.r-project.org/ and ensure Rscript is in your PATH.',
    LibraryScanError: 'Check that R is properly installed and try running the command again.',
    ENOENT: 'The specified file or directory does not exist.',
    EACCES: 'Permission denied. Try running with elevated privileges.',
    ECONNREFUSED: 'Could not connect to the server. Check your network connection.',
    ETIMEDOUT: 'Request timed out. Check your network connection and try again.',
};

const ERROR_EXIT_CODES: Record<string, number> = {
    DirectoryNotFoundError: 2,
    InvalidDirectoryError: 2,
    RNotFoundError: 3,
    LibraryScanError: 3,
    ValidationError: 4,
    LLMError: 5,
    default: 1,
};

// ============================================
// Error Handler Class
// ============================================

export class ErrorHandler {
    private options: Required<ErrorHandlerOptions>;

    constructor(options: ErrorHandlerOptions = {}) {
        this.options = {
            showStack: options.showStack ?? (process.env.DEBUG === 'true'),
            exitOnError: options.exitOnError ?? true,
            exitCode: options.exitCode ?? 1,
        };
    }

    /**
     * Handle an error with appropriate formatting and output
     */
    handle(error: unknown, context?: string): void {
        const formatted = this.format(error);
        this.output(formatted, context);

        if (this.options.exitOnError) {
            process.exit(formatted.exitCode);
        }
    }

    /**
     * Format an error into a user-friendly structure
     */
    format(error: unknown): FormattedError {
        if (error instanceof CLIError) {
            return this.formatCLIError(error);
        }

        if (error instanceof Error) {
            return this.formatStandardError(error);
        }

        return {
            type: 'UnknownError',
            message: String(error),
            exitCode: this.options.exitCode,
        };
    }

    /**
     * Output formatted error to console
     */
    output(formatted: FormattedError, context?: string): void {
        console.error('');

        // Context header
        if (context) {
            console.error(chalk.red.bold(`Error during ${context}:`));
        } else {
            console.error(chalk.red.bold('Error:'));
        }

        // Error type and message
        console.error(chalk.red(`  [${formatted.type}] ${formatted.message}`));

        // Suggestion
        if (formatted.suggestion) {
            console.error('');
            console.error(chalk.yellow('  Suggestion:'));
            console.error(chalk.yellow(`    ${formatted.suggestion}`));
        }

        console.error('');
    }

    /**
     * Format CLI-specific errors
     */
    private formatCLIError(error: CLIError): FormattedError {
        const type = error.name;
        const suggestion = ERROR_SUGGESTIONS[type];
        const exitCode = ERROR_EXIT_CODES[type] || this.options.exitCode;

        return {
            type,
            message: error.message,
            suggestion,
            exitCode,
        };
    }

    /**
     * Format standard JavaScript errors
     */
    private formatStandardError(error: Error): FormattedError {
        // Check for common error codes
        const errorCode = (error as NodeJS.ErrnoException).code;
        const suggestion = errorCode ? ERROR_SUGGESTIONS[errorCode] : undefined;

        return {
            type: error.name,
            message: error.message,
            suggestion,
            exitCode: this.options.exitCode,
        };
    }

    /**
     * Create error handler that doesn't exit (for testing/async flows)
     */
    static nonExiting(): ErrorHandler {
        return new ErrorHandler({ exitOnError: false });
    }

    /**
     * Create error handler with debug mode
     */
    static debug(): ErrorHandler {
        return new ErrorHandler({ showStack: true, exitOnError: false });
    }
}

// ============================================
// Convenience Functions
// ============================================

/** Default error handler instance */
const defaultHandler = new ErrorHandler();

/**
 * Handle error with default settings
 */
export function handleError(error: unknown, context?: string): void {
    defaultHandler.handle(error, context);
}

/**
 * Format error without outputting
 */
export function formatError(error: unknown): FormattedError {
    return defaultHandler.format(error);
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    context?: string
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleError(error, context);
        }
    }) as T;
}

export default ErrorHandler;
