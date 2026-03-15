/**
 * Service: FileFinder
 *
 * Single responsibility: scan a workspace directory for R-related files
 * and build lightweight previews (first N lines) for each.
 *
 * This service has no knowledge of LLMs or APIs — it is purely a
 * filesystem concern.
 */

import { readFile } from 'fs/promises';
import { relative } from 'path';
import { glob } from 'glob';
import { FilePreview } from '../../infrastructure/api/ruby-api-client';

// ============================================
// Constants
// ============================================

/** R-related file extensions to include */
const R_FILE_PATTERNS = ['**/*.R', '**/*.r', '**/*.Rmd', '**/*.rmd', '**/*.Rproj'];

/** Directories to always skip */
const IGNORE_PATTERNS = ['**/node_modules/**', '**/.git/**', '**/renv/**'];

/** Lines to preview per file — enough for an LLM to judge relevance */
const PREVIEW_LINES = 10;

// ============================================
// FileFinder
// ============================================

export class FileFinder {
    /**
     * Glob all R-related files under `workspaceDir`, cap at `maxFiles`,
     * and return a lightweight preview of each.
     */
    async scan(workspaceDir: string, maxFiles: number): Promise<FilePreview[]> {
        const absolutePaths = await this.globFiles(workspaceDir, maxFiles);
        return this.buildPreviews(absolutePaths, workspaceDir);
    }

    // ============================================
    // Private helpers
    // ============================================

    private async globFiles(workspaceDir: string, maxFiles: number): Promise<string[]> {
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
                const preview = content.split('\n').slice(0, PREVIEW_LINES).join('\n');
                previews.push({ path: relative(workspaceDir, absPath), preview });
            } catch {
                // Skip unreadable files silently
            }
        }

        return previews;
    }
}
