/**
 * Service: Code Confirmer
 *
 * Terminal-based confirmation UI for R code execution.
 * Displays code preview and prompts user for confirmation.
 */

import * as readline from 'readline';
import chalk from 'chalk';

// ============================================
// Types
// ============================================

export interface ConfirmationResult {
    approved: boolean;
    reason?: string;
}

export interface ConfirmationOptions {
    /** Title to display above the code */
    title?: string;
    /** Maximum lines to show in preview */
    maxPreviewLines?: number;
    /** Show line numbers in preview */
    showLineNumbers?: boolean;
    /** Default answer if user just presses Enter */
    defaultAnswer?: boolean;
}

// ============================================
// Code Confirmer Service
// ============================================

export class CodeConfirmer {
    private options: Required<ConfirmationOptions>;

    constructor(options?: ConfirmationOptions) {
        this.options = {
            title: options?.title ?? 'R Code to Execute',
            maxPreviewLines: options?.maxPreviewLines ?? 30,
            showLineNumbers: options?.showLineNumbers ?? true,
            defaultAnswer: options?.defaultAnswer ?? false,
        };
    }

    /**
     * Prompt user to confirm code execution
     */
    async confirm(code: string): Promise<ConfirmationResult> {
        this.displayCodePreview(code);
        return this.promptConfirmation();
    }

    /**
     * Display formatted code preview in terminal
     */
    displayCodePreview(code: string): void {
        const lines = code.split('\n');
        const displayLines = lines.slice(0, this.options.maxPreviewLines);
        const truncated = lines.length > this.options.maxPreviewLines;

        console.log('');
        console.log(chalk.bold.cyan('═'.repeat(60)));
        console.log(chalk.bold.cyan(`  ${this.options.title}`));
        console.log(chalk.bold.cyan('═'.repeat(60)));
        console.log('');

        displayLines.forEach((line, index) => {
            if (this.options.showLineNumbers) {
                const lineNum = chalk.gray(`${String(index + 1).padStart(3, ' ')} │ `);
                console.log(`${lineNum}${this.highlightRCode(line)}`);
            } else {
                console.log(`  ${this.highlightRCode(line)}`);
            }
        });

        if (truncated) {
            console.log('');
            console.log(chalk.yellow(`  ... (${lines.length - this.options.maxPreviewLines} more lines)`));
        }

        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
    }

    /**
     * Prompt user for confirmation
     */
    private async promptConfirmation(): Promise<ConfirmationResult> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const defaultHint = this.options.defaultAnswer ? 'Y/n' : 'y/N';
        const prompt = chalk.yellow(`Execute this code? [${defaultHint}]: `);

        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                rl.close();

                const normalizedAnswer = answer.trim().toLowerCase();

                if (normalizedAnswer === '') {
                    resolve({
                        approved: this.options.defaultAnswer,
                        reason: 'default',
                    });
                } else if (['y', 'yes'].includes(normalizedAnswer)) {
                    resolve({ approved: true });
                } else if (['n', 'no'].includes(normalizedAnswer)) {
                    resolve({ approved: false, reason: 'user rejected' });
                } else {
                    console.log(chalk.red('Invalid input. Please enter Y or N.'));
                    resolve({ approved: false, reason: 'invalid input' });
                }
            });
        });
    }

    /**
     * Simple R syntax highlighting for terminal display
     */
    private highlightRCode(line: string): string {
        return line
            // Comments
            .replace(/(#.*)$/g, chalk.gray('$1'))
            // Strings (double quotes)
            .replace(/("(?:[^"\\]|\\.)*")/g, chalk.green('$1'))
            // Strings (single quotes)
            .replace(/('(?:[^'\\]|\\.)*')/g, chalk.green('$1'))
            // Keywords
            .replace(/\b(function|if|else|for|while|repeat|break|next|return|in|TRUE|FALSE|NULL|NA|Inf|NaN)\b/g, chalk.magenta('$1'))
            // Assignment operators
            .replace(/(<-|->|<<-|->>|=(?!=))/g, chalk.cyan('$1'))
            // Numeric values
            .replace(/\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, chalk.yellow('$1'))
            // Pipe operators
            .replace(/(\|>|%>%)/g, chalk.cyan('$1'));
    }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick confirmation with default settings
 */
export async function confirmCode(
    code: string,
    options?: ConfirmationOptions
): Promise<ConfirmationResult> {
    const confirmer = new CodeConfirmer(options);
    return confirmer.confirm(code);
}

/**
 * Display code preview without confirmation
 */
export function displayCode(code: string, title?: string): void {
    const confirmer = new CodeConfirmer({ title });
    confirmer.displayCodePreview(code);
}

export default CodeConfirmer;
