/**
 * Service: FileReadService
 *
 * Encapsulates all fs I/O and domain guards for reading a file.
 * Returns a discriminated union so callers never touch the filesystem directly.
 */

import path from 'path';
import { IFileSystem } from '../../domain/types/file-system';
import { isContentEditable } from '../../domain/policies/agent-file-policy';

export type FileReadResult =
    | { content: string; absPath: string }
    | { error: string };

export class FileReadService {
    constructor(private readonly fileSystem: IFileSystem) {}

    read(filePath: string): FileReadResult {
        const absPath = path.resolve(filePath);

        if (!this.fileSystem.exists(absPath)) {
            return { error: `File not found: ${absPath}` };
        }

        let content: string;
        try {
            content = this.fileSystem.read(absPath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { error: `Failed to read file: ${msg}` };
        }

        const sizeCheck = isContentEditable(absPath, content);
        if (!sizeCheck.ok) {
            return { error: `File too large to read: ${sizeCheck.reason}` };
        }

        return { content, absPath };
    }
}
