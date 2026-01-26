/**
 * Service: R Bridge
 *
 * File-based communication with the Mindy R package running in RStudio.
 * Writes command files that the R listener picks up and executes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExecutionResponse } from '../types/execution';
import { EXECUTION } from '../config/constants';
import {
    PlumberConnectionError,
    PlumberTimeoutError,
} from '../utils/errors';

// ============================================
// File Paths
// ============================================

function getMindyDir(): string {
    const dir = path.join(os.homedir(), '.mindy', 'commands');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getPendingFile(): string {
    return path.join(getMindyDir(), 'pending.json');
}

function getResultFile(): string {
    return path.join(getMindyDir(), 'result.json');
}

function getLockFile(): string {
    return path.join(getMindyDir(), '.lock');
}

// ============================================
// Command Interface
// ============================================

interface Command {
    id: string;
    action?: 'run_current' | 'run_code' | 'run_file' | 'render_rmd';
    code?: string;
    file?: string;
    timestamp: string;
}

// ============================================
// R Bridge Service
// ============================================

export class RBridge {
    private timeout: number;

    constructor(timeout?: number) {
        this.timeout = timeout ?? EXECUTION.DEFAULT_TIMEOUT_MS;
    }

    /**
     * Check if the R listener is running
     */
    isListenerRunning(): boolean {
        const lockFile = getLockFile();
        return fs.existsSync(lockFile);
    }

    /**
     * Wait for listener to be ready
     */
    async waitForListener(maxWaitMs = 5000): Promise<boolean> {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            if (this.isListenerRunning()) {
                return true;
            }
            await this.sleep(100);
        }
        return false;
    }

    /**
     * Run the currently open file in RStudio
     */
    async runCurrentFile(): Promise<ExecutionResponse> {
        if (!this.isListenerRunning()) {
            throw new PlumberConnectionError('localhost', 0);
        }

        const id = this.generateId();
        const command: Command = {
            id,
            action: 'run_current',
            timestamp: new Date().toISOString(),
        };

        return this.sendCommandAndWait(command);
    }

    /**
     * Run R code in RStudio
     */
    async runCode(code: string): Promise<ExecutionResponse> {
        if (!this.isListenerRunning()) {
            throw new PlumberConnectionError('localhost', 0);
        }

        const id = this.generateId();
        const command: Command = {
            id,
            action: 'run_code',
            code,
            timestamp: new Date().toISOString(),
        };

        return this.sendCommandAndWait(command);
    }

    /**
     * Run an R file in RStudio
     */
    async runFile(filePath: string): Promise<ExecutionResponse> {
        if (!this.isListenerRunning()) {
            throw new PlumberConnectionError('localhost', 0);
        }

        const id = this.generateId();
        const command: Command = {
            id,
            action: 'run_file',
            file: path.resolve(filePath),
            timestamp: new Date().toISOString(),
        };

        return this.sendCommandAndWait(command);
    }

    /**
     * Render an Rmd file in RStudio
     */
    async renderRmd(filePath: string): Promise<ExecutionResponse> {
        if (!this.isListenerRunning()) {
            throw new PlumberConnectionError('localhost', 0);
        }

        const id = this.generateId();
        const command: Command = {
            id,
            action: 'render_rmd',
            file: path.resolve(filePath),
            timestamp: new Date().toISOString(),
        };

        return this.sendCommandAndWait(command);
    }

    // ============================================
    // Private Methods
    // ============================================

    private async sendCommandAndWait(command: Command): Promise<ExecutionResponse> {
        // Clear any previous result
        const resultFile = getResultFile();
        if (fs.existsSync(resultFile)) {
            fs.unlinkSync(resultFile);
        }

        // Write the command file
        const pendingFile = getPendingFile();
        fs.writeFileSync(pendingFile, JSON.stringify(command, null, 2), 'utf-8');

        // Wait for result
        return this.waitForResult(command.id);
    }

    private async waitForResult(expectedId: string): Promise<ExecutionResponse> {
        const resultFile = getResultFile();
        const startTime = Date.now();

        while (Date.now() - startTime < this.timeout) {
            if (fs.existsSync(resultFile)) {
                try {
                    const content = fs.readFileSync(resultFile, 'utf-8');
                    const result = JSON.parse(content) as ExecutionResponse;

                    // Check if this is the result we're waiting for
                    if (result.id === expectedId || result.id === null) {
                        // Clean up result file
                        fs.unlinkSync(resultFile);
                        return result;
                    }
                } catch {
                    // JSON parse error, file might be partially written
                    await this.sleep(50);
                }
            }

            await this.sleep(EXECUTION.POLL_INTERVAL_MS);
        }

        throw new PlumberTimeoutError(this.timeout);
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // Configuration
    // ============================================

    setTimeout(timeoutMs: number): void {
        this.timeout = Math.min(timeoutMs, EXECUTION.MAX_TIMEOUT_MS);
    }
}

// ============================================
// Singleton Instance
// ============================================

let defaultBridge: RBridge | null = null;

export function getRBridge(timeout?: number): RBridge {
    if (!defaultBridge || timeout) {
        defaultBridge = new RBridge(timeout);
    }
    return defaultBridge;
}

export default RBridge;
