/**
 * Formatting Utilities
 *
 * Centralized formatting functions used across the CLI.
 */

import * as path from 'path';

// ============================================
// File Size Formatting
// ============================================

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const FILE_SIZE_BASE = 1024;

/**
 * Format file size to human-readable string
 *
 * @example
 * formatFileSize(0)       // '0 B'
 * formatFileSize(1024)    // '1 KB'
 * formatFileSize(1536)    // '1.5 KB'
 * formatFileSize(1048576) // '1 MB'
 */
export function formatFileSize(bytes: number): string {
    if (bytes <= 0) return '0 B';

    const i = Math.floor(Math.log(bytes) / Math.log(FILE_SIZE_BASE));
    const safeIndex = Math.min(i, FILE_SIZE_UNITS.length - 1);
    const size = bytes / Math.pow(FILE_SIZE_BASE, safeIndex);

    // Remove trailing .0 for cleaner output
    const formatted = size.toFixed(1).replace(/\.0$/, '');
    return `${formatted} ${FILE_SIZE_UNITS[safeIndex]}`;
}

// ============================================
// Path Formatting
// ============================================

/**
 * Format path relative to base directory
 *
 * @example
 * formatRelativePath('/home/user/project/src/index.ts', '/home/user/project')
 * // Returns: 'src/index.ts'
 */
export function formatRelativePath(filePath: string, baseDir: string): string {
    const resolvedBase = path.resolve(baseDir);
    const resolvedFile = path.resolve(filePath);

    if (resolvedFile.startsWith(resolvedBase)) {
        const relative = path.relative(resolvedBase, resolvedFile);
        return relative || path.basename(filePath);
    }

    return filePath;
}

// ============================================
// Date Formatting
// ============================================

/**
 * Format date to readable string
 */
export function formatDate(date: Date): string {
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format date to ISO string (for JSON output)
 */
export function formatDateISO(date: Date): string {
    return date.toISOString();
}

// ============================================
// Number Formatting
// ============================================

/**
 * Format number with locale-aware thousand separators
 */
export function formatNumber(num: number): string {
    return num.toLocaleString();
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}
