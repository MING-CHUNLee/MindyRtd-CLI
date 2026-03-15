/**
 * Service: FileResolver
 *
 * Answers the question: "Given a natural language instruction,
 * which R files in the workspace are actually relevant?"
 *
 * This mirrors how Claude Code works:
 *   1. Scan the workspace via FileFinder → lightweight previews
 *   2. Ask the LLM (via Ruby API) to pick the relevant ones
 *   3. Return the resolved file paths
 *
 * The LLM only sees file names + short previews in Phase 1,
 * so it is fast and cheap. Full content is only sent in Phase 2 (edit).
 */

import { resolve } from 'path';
import { RubyApiClient } from '../../infrastructure/api/ruby-api-client';
import { FileFinder } from './file-finder';

// ============================================
// Types
// ============================================

export interface ResolveOptions {
    /** Workspace root to scan. Defaults to process.cwd() */
    workspaceDir?: string;
    /** Max files to send to LLM (guards against huge workspaces) */
    maxFiles?: number;
}

export interface ResolvedFile {
    /** Absolute path */
    absolutePath: string;
    /** Path relative to workspaceDir (shown to user) */
    relativePath: string;
}

// ============================================
// FileResolver Service
// ============================================

export class FileResolver {
    private client: RubyApiClient;
    private finder: FileFinder;

    constructor(client?: RubyApiClient, finder?: FileFinder) {
        this.client = client ?? new RubyApiClient();
        this.finder = finder ?? new FileFinder();
    }

    /**
     * Scan the workspace, preview each file, ask the LLM which ones
     * are relevant to the instruction, and return the resolved paths.
     */
    async resolve(instruction: string, options: ResolveOptions = {}): Promise<ResolvedFile[]> {
        const workspaceDir = resolve(options.workspaceDir ?? process.cwd());
        const maxFiles = options.maxFiles ?? 30;

        // Step 1: Scan workspace and build previews
        const previews = await this.finder.scan(workspaceDir, maxFiles);

        if (previews.length === 0) {
            return [];
        }

        // Step 2: Ask LLM which files are relevant
        const { targetFiles } = await this.client.resolveFiles({
            instruction,
            files: previews,
        });

        // Step 3: Map back to absolute paths
        return targetFiles.map((relativePath) => ({
            absolutePath: resolve(workspaceDir, relativePath),
            relativePath,
        }));
    }
}
