import * as path from 'path';

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1));

    return `${size} ${units[i]}`;
}

/**
 * Format path relative to base directory
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
