/**
 * Service: FileResolver
 *
 * Answers the question: "Given a natural language instruction,
 * which R files in the workspace are actually relevant?"
 *
 * This mirrors how Claude Code works:
 *   1. Scan the workspace (Glob → list of paths)
 *   2. Build lightweight previews (first N lines of each file)
 *   3. Ask the LLM (via Ruby API) to pick the relevant ones
 *   4. Return the resolved file paths
 *
 * The LLM only sees file names + short previews in Phase 1,
 * so it is fast and cheap. Full content is only sent in Phase 2 (edit).
 */

import { readFile } from 'fs/promises';
import { resolve, relative } from 'path';
import { glob } from 'glob';
import { RubyApiClient, FilePreview } from '../../infrastructure/api/ruby-api-client';

// ============================================
// Constants
// ============================================

/** R-related file extensions to include in resolution */
const R_FILE_PATTERNS = ['**/*.R', '**/*.r', '**/*.Rmd', '**/*.rmd', '**/*.Rproj'];

/** Directories to always skip */
const IGNORE_PATTERNS = ['**/node_modules/**', '**/.git/**', '**/renv/**'];

/** Lines to preview per file — enough for the LLM to judge relevance */
const PREVIEW_LINES = 10;

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

    constructor(client?: RubyApiClient) {
        this.client = client ?? new RubyApiClient();
    }

    /**
     * Scan the workspace, preview each file, ask the LLM which ones
     * are relevant to the instruction, and return the resolved paths.
     */
    async resolve(instruction: string, options: ResolveOptions = {}): Promise<ResolvedFile[]> {
        const workspaceDir = resolve(options.workspaceDir ?? process.cwd());
        const maxFiles = options.maxFiles ?? 30;

        // Step 1: Glob all R files in the workspace
        const allPaths = await this.scanWorkspace(workspaceDir, maxFiles);

        if (allPaths.length === 0) {
            return [];
        }

        // Step 2: Build previews (first N lines of each file)
        const previews = await this.buildPreviews(allPaths, workspaceDir);

        // Step 3: Ask LLM which files are relevant
        const { targetFiles } = await this.client.resolveFiles({
            instruction,
            files: previews,
        });

        // Step 4: Map back to absolute paths
        return targetFiles.map((relativePath) => ({
            absolutePath: resolve(workspaceDir, relativePath),
            relativePath,
        }));
    }

    // ============================================
    // Helpers
    // ============================================

    private async scanWorkspace(workspaceDir: string, maxFiles: number): Promise<string[]> {
        const paths: string[] = [];

        for (const pattern of R_FILE_PATTERNS) {
            const matches = await glob(pattern, {
                cwd: workspaceDir,
                ignore: IGNORE_PATTERNS,
                absolute: true,
            });
            paths.push(...matches);
            if (paths.length >= maxFiles) break;
        }

        // Deduplicate and cap
        return [...new Set(paths)].slice(0, maxFiles);
    }

    private async buildPreviews(
        absolutePaths: string[],
        workspaceDir: string
    ): Promise<FilePreview[]> {
        const previews: FilePreview[] = [];

        for (const absPath of absolutePaths) {
            try {
                const content = await readFile(absPath, 'utf-8');
                const preview = content
                    .split('\n')
                    .slice(0, PREVIEW_LINES)
                    .join('\n');

                previews.push({
                    path: relative(workspaceDir, absPath),
                    preview,
                });
            } catch {
                // Skip unreadable files silently
            }
        }

        return previews;
    }
}
