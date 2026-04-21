import * as diff from 'diff';
import chalk from 'chalk';

export class DiffEngine {
    /**
     * Compare two strings and return a coloured terminal output (simplified patch format).
     */
    public generateColoredDiff(oldStr: string, newStr: string): string {
        const differences = diff.diffLines(oldStr, newStr);
        let output = '';

        // Identical files — nothing to show
        if (differences.length === 1 && !differences[0].added && !differences[0].removed) {
            return chalk.gray('No changes detected.');
        }

        differences.forEach((part) => {
            if (part.added) {
                output += chalk.green(this.prefixLines(part.value, '+ '));
            } else if (part.removed) {
                output += chalk.red(this.prefixLines(part.value, '- '));
            } else {
                output += chalk.gray(this.prefixLines(part.value, '  '));
            }
        });

        return output;
    }

    /**
     * Prefix every line in text with the given prefix string.
     */
    private prefixLines(text: string, prefix: string): string {
        return text
            .replace(/\n$/, '')
            .split('\n')
            .map(line => `${prefix}${line}\n`)
            .join('');
    }
}
