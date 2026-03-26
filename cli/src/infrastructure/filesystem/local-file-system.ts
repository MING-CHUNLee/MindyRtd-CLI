/**
 * Infrastructure: LocalFileSystem
 *
 * Concrete implementation of IFileSystem that delegates to Node's `fs` module.
 * This is the only file in the codebase that should import `fs` for basic
 * read/write/exists/mkdir/stat operations.
 */

import fs from 'fs';
import path from 'path';
import { IFileSystem, FileStats } from '../../domain/interfaces/file-system';

export class LocalFileSystem implements IFileSystem {
    exists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    read(filePath: string): string {
        return fs.readFileSync(filePath, 'utf8');
    }

    write(filePath: string, content: string): void {
        fs.writeFileSync(filePath, content, 'utf8');
    }

    mkdir(dirPath: string): void {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    stat(filePath: string): FileStats {
        const s = fs.statSync(filePath);
        return {
            size: s.size,
            modifiedAt: s.mtime,
            isDirectory: s.isDirectory(),
        };
    }
}
