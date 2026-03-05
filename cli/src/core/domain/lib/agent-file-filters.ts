/**
 * Domain lib: Agent File Filters
 *
 * Domain knowledge about which files an agent should and should not edit.
 * Read-only rules — no business logic, just data.
 *
 * Applied in two phases:
 *   Phase 0 — filename/extension filter (before LLM sees any file)
 *   Phase 2 — content-size filter     (after reading file from disk)
 */

import path from 'path';

// ── Never-edit list ───────────────────────────────────────────────────────────
// Generated or lock files that must never be passed to the LLM for editing.

const NEVER_EDIT_FILENAMES = new Set([
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Gemfile.lock',
    'poetry.lock',
    'composer.lock',
    'Cargo.lock',
]);

const NEVER_EDIT_PATTERNS = [
    /\.lock$/,
    /\.min\.(js|css)$/,   // minified bundles
    /\.d\.ts$/,           // TypeScript declaration files (generated)
    /(^|\/)dist\//,       // compiled output
    /(^|\/)\.next\//,     // Next.js build output
];

// ── Editable extensions ───────────────────────────────────────────────────────
// Only source-code and document files are worth sending to the LLM.

const EDITABLE_EXTENSIONS = new Set([
    // TypeScript / JavaScript
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    // R / R Markdown
    '.R', '.r', '.Rmd', '.rmd',
    // Other languages
    '.py', '.rb', '.go', '.java', '.cs', '.cpp', '.c', '.h',
    // Shell
    '.sh', '.bash', '.zsh',
    // Docs (but NOT lock or config)
    '.md',
]);

// ── Size threshold ────────────────────────────────────────────────────────────
// Files larger than this are skipped in Phase 2 to stay well under token limits.
// 10 000 chars ≈ 2 500 tokens — large enough for most source files.

export const MAX_FILE_CONTENT_CHARS = 10_000;

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Phase 0 check — based on filename and extension only (no file I/O).
 * Returns false for lock files, generated files, and non-code extensions.
 */
export function isFilenameEditable(filePath: string): boolean {
    const basename = path.basename(filePath);
    const ext      = path.extname(filePath).toLowerCase();

    if (NEVER_EDIT_FILENAMES.has(basename))                    return false;
    if (NEVER_EDIT_PATTERNS.some(p => p.test(filePath)))       return false;
    if (ext && !EDITABLE_EXTENSIONS.has(ext))                  return false;

    return true;
}

/**
 * Phase 2 check — based on content size (after reading from disk).
 * Returns false with a human-readable reason when the file is too large.
 */
export function isContentEditable(
    filePath: string,
    content: string,
): { ok: true } | { ok: false; reason: string } {
    if (content.length > MAX_FILE_CONTENT_CHARS) {
        const kb = (content.length / 1_000).toFixed(1);
        return {
            ok: false,
            reason: `${path.basename(filePath)} is ${kb}k chars — exceeds ${MAX_FILE_CONTENT_CHARS / 1_000}k limit`,
        };
    }
    return { ok: true };
}
