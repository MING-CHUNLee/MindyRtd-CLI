/**
 * TestWorkspace
 *
 * Creates a real temporary directory on disk for acceptance tests.
 * Files are written at construction time; the directory is deleted on cleanup().
 *
 * Usage:
 *   const ws = TestWorkspace.create({ 'analysis.R': 'x <- 1\n' });
 *   // ... run tests that use ws.root ...
 *   ws.cleanup();
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class TestWorkspace {
    readonly root: string;

    private constructor(root: string) {
        this.root = root;
    }

    /**
     * Create a temp workspace with the given files.
     * Keys are relative paths; values are file contents.
     */
    static create(files: Record<string, string> = {}): TestWorkspace {
        const root = path.join(
            os.tmpdir(),
            `mindy-acceptance-${crypto.randomBytes(6).toString('hex')}`,
        );
        fs.mkdirSync(root, { recursive: true });

        for (const [relPath, content] of Object.entries(files)) {
            const abs = path.join(root, relPath);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, content, 'utf-8');
        }

        return new TestWorkspace(root);
    }

    /** Read a file from the workspace (relative path). */
    readFile(relativePath: string): string {
        return fs.readFileSync(path.join(this.root, relativePath), 'utf-8');
    }

    /** Check if a file exists in the workspace. */
    exists(relativePath: string): boolean {
        return fs.existsSync(path.join(this.root, relativePath));
    }

    /** Remove the entire temp directory. */
    cleanup(): void {
        try {
            fs.rmSync(this.root, { recursive: true, force: true });
        } catch {
            // best-effort: ignore cleanup errors
        }
    }
}
