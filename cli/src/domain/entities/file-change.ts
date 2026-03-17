/**
 * Domain Entity: FileChange
 *
 * A pending file mutation produced during a conversation turn.
 * Always has a target path — invalid without one.
 *
 * Types:
 *   edit — full file content replacement
 *   diff — raw unified diff to be applied
 */

export type FileChangeType = 'edit' | 'diff';

export interface FileChangeJSON {
    id: string;
    type: FileChangeType;
    path: string;
    content: string;
    createdAt: string;
}

export class FileChange {
    readonly createdAt: Date;

    constructor(
        readonly id: string,
        readonly type: FileChangeType,
        readonly path: string,
        readonly content: string,
        createdAt?: Date,
    ) {
        this.createdAt = createdAt ?? new Date();
    }

    static create(type: FileChangeType, path: string, content: string): FileChange {
        const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return new FileChange(id, type, path, content);
    }

    toJSON(): FileChangeJSON {
        return {
            id: this.id,
            type: this.type,
            path: this.path,
            content: this.content,
            createdAt: this.createdAt.toISOString(),
        };
    }

    static fromJSON(data: FileChangeJSON): FileChange {
        return new FileChange(data.id, data.type, data.path, data.content, new Date(data.createdAt));
    }
}
