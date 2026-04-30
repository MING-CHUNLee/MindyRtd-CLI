/**
 * PolicyLoader
 *
 * Reads agent/*.md policy files at runtime.
 * Files are resolved relative to this module's location so they work
 * both in dev (src/) and after build (dist/) — as long as the build script
 * copies src/agent/ → dist/agent/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkflowMode } from './settings';

function getAgentDir(): string {
    // Works in both CJS (__dirname) and ESM (import.meta.url)
    try {
        const __filename = fileURLToPath(import.meta.url);
        return path.join(path.dirname(__filename), '..', '..', 'agent');
    } catch {
        // Fallback for CJS environments
        return path.join(__dirname, '..', '..', 'agent');
    }
}

export class PolicyLoader {
    private readonly agentDir: string;

    constructor(agentDir?: string) {
        this.agentDir = agentDir ?? getAgentDir();
    }

    /**
     * Load the policy markdown for the given mode.
     * Returns an empty string (non-fatal) if the file is not found.
     */
    load(mode: WorkflowMode): string {
        const filePath = path.join(this.agentDir, `${mode}.md`);
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch {
            return '';
        }
    }
}
