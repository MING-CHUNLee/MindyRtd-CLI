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
    /** When set, checks <overlayDir>/tutors/<mode>.md before the built-in agent dir. */
    private readonly overlayDir?: string;

    constructor(agentDir?: string, overlayDir?: string) {
        this.agentDir = agentDir ?? getAgentDir();
        this.overlayDir = overlayDir;
    }

    /**
     * Load the policy markdown for the given mode.
     * Resolution order (first non-empty wins):
     *   1. <overlayDir>/tutors/<mode>/TUTOR.md  (directory-based assignment policy)
     *   2. <overlayDir>/tutors/<mode>.md         (flat-file assignment policy)
     *   3. <agentDir>/<mode>.md                  (built-in default)
     * Returns an empty string (non-fatal) if no file is found.
     */
    load(mode: WorkflowMode): string {
        if (this.overlayDir) {
            const dirPath = path.join(this.overlayDir, 'tutors', mode, 'TUTOR.md');
            try {
                const content = fs.readFileSync(dirPath, 'utf-8');
                if (content) return content;
            } catch { /* fall through */ }

            const flatPath = path.join(this.overlayDir, 'tutors', `${mode}.md`);
            try {
                const content = fs.readFileSync(flatPath, 'utf-8');
                if (content) return content;
            } catch { /* fall through to built-in */ }
        }
        const filePath = path.join(this.agentDir, `${mode}.md`);
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch {
            return '';
        }
    }
}
