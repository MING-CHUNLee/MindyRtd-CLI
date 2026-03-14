/**
 * Unit Tests: DiffEngine
 */

import { describe, it, expect } from 'vitest';
import { DiffEngine } from '../src/application/services/diff-engine';

// Strip ANSI escape codes so we can assert on plain text
function stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('DiffEngine', () => {
    const engine = new DiffEngine();

    describe('generateColoredDiff()', () => {
        it('returns a no-change message when both strings are identical', () => {
            const result = engine.generateColoredDiff('x <- 1\n', 'x <- 1\n');
            const plain = stripAnsi(result);

            // Either the Chinese message or some equivalent "no change" indicator
            expect(plain.length).toBeGreaterThan(0);
            // Should NOT contain +/- markers for identical input
            expect(plain).not.toMatch(/^\+/m);
            expect(plain).not.toMatch(/^-/m);
        });

        it('marks added lines with "+"', () => {
            const oldStr = 'x <- 1\n';
            const newStr = 'x <- 1\ny <- 2\n';
            const result = stripAnsi(engine.generateColoredDiff(oldStr, newStr));

            expect(result).toMatch(/^\+ y <- 2/m);
        });

        it('marks removed lines with "-"', () => {
            const oldStr = 'x <- 1\ny <- 2\n';
            const newStr = 'x <- 1\n';
            const result = stripAnsi(engine.generateColoredDiff(oldStr, newStr));

            expect(result).toMatch(/^- y <- 2/m);
        });

        it('marks unchanged lines with "  " (two spaces)', () => {
            const oldStr = 'a <- 1\nb <- 2\nc <- 3\n';
            const newStr = 'a <- 1\nb <- 99\nc <- 3\n';
            const result = stripAnsi(engine.generateColoredDiff(oldStr, newStr));

            // 'a' and 'c' lines are unchanged
            expect(result).toMatch(/^  a <- 1/m);
            expect(result).toMatch(/^  c <- 3/m);
        });

        it('handles empty old string (new file creation)', () => {
            const result = stripAnsi(engine.generateColoredDiff('', 'x <- 1\n'));

            expect(result).toMatch(/^\+ x <- 1/m);
        });

        it('handles empty new string (file deletion)', () => {
            const result = stripAnsi(engine.generateColoredDiff('x <- 1\n', ''));

            expect(result).toMatch(/^- x <- 1/m);
        });

        it('handles both strings being empty without throwing', () => {
            // diffLines('', '') produces an empty array → forEach produces ''
            expect(() => engine.generateColoredDiff('', '')).not.toThrow();
        });

        it('handles multiline changes', () => {
            const oldStr = 'line1\nline2\nline3\n';
            const newStr = 'line1\nLINE2_CHANGED\nline3\n';
            const result = stripAnsi(engine.generateColoredDiff(oldStr, newStr));

            expect(result).toMatch(/^- line2/m);
            expect(result).toMatch(/^\+ LINE2_CHANGED/m);
        });
    });
});
