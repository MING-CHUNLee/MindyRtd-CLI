/**
 * Unit Tests: CLI Errors
 * 
 * Tests for CLI error classes.
 */

import { describe, it, expect } from 'vitest';
import { CLIError, DirectoryNotFoundError, InvalidDirectoryError } from '../src/utils/errors';

describe('CLI Errors', () => {
    describe('CLIError', () => {
        it('should create base error', () => {
            const error = new CLIError('Test error');

            expect(error.message).toBe('Test error');
            expect(error.name).toBe('CLIError');
            expect(error).toBeInstanceOf(Error);
        });
    });

    describe('DirectoryNotFoundError', () => {
        it('should include path in message', () => {
            const error = new DirectoryNotFoundError('/missing/path');

            expect(error.message).toBe('Directory not found: /missing/path');
            expect(error.path).toBe('/missing/path');
            expect(error.name).toBe('DirectoryNotFoundError');
            expect(error).toBeInstanceOf(CLIError);
        });
    });

    describe('InvalidDirectoryError', () => {
        it('should include path in message', () => {
            const error = new InvalidDirectoryError('/some/file.txt');

            expect(error.message).toBe('Path is not a directory: /some/file.txt');
            expect(error.path).toBe('/some/file.txt');
            expect(error.name).toBe('InvalidDirectoryError');
        });
    });
});
