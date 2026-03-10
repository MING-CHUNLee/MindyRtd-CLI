/**
 * Domain Entity: Artifact
 *
 * A structured output produced during a conversation turn.
 * Attached to ConversationTurn so that every output (file edit, code snippet,
 * analysis report) can be indexed, reviewed, and retrieved later.
 *
 * Types:
 *   edit     — file content change (has path)
 *   diff     — raw unified diff (has path)
 *   code     — code snippet without a target file
 *   analysis — analysis report / explanation
 *   report   — structured report output
 */

export type ArtifactType = 'edit' | 'diff' | 'code' | 'analysis' | 'report';

export interface ArtifactJSON {
    id: string;
    type: ArtifactType;
    /** File path — only present for 'edit' and 'diff' artifacts */
    path?: string;
    content: string;
    createdAt: string;
}

export class Artifact {
    readonly createdAt: Date;

    constructor(
        readonly id: string,
        readonly type: ArtifactType,
        readonly content: string,
        readonly path?: string,
        createdAt?: Date,
    ) {
        this.createdAt = createdAt ?? new Date();
    }

    static create(type: ArtifactType, content: string, path?: string): Artifact {
        const id = `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return new Artifact(id, type, content, path);
    }

    toJSON(): ArtifactJSON {
        return {
            id: this.id,
            type: this.type,
            path: this.path,
            content: this.content,
            createdAt: this.createdAt.toISOString(),
        };
    }

    static fromJSON(data: ArtifactJSON): Artifact {
        return new Artifact(
            data.id,
            data.type,
            data.content,
            data.path,
            new Date(data.createdAt),
        );
    }
}
