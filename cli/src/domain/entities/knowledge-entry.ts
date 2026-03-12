/**
 * Domain Entity: KnowledgeEntry
 *
 * A single item in the agent's knowledge base.
 * Supports cross-session semantic memory via lightweight keyword retrieval.
 *
 * Fields:
 *   title      — short label shown in lists and injected into prompts
 *   content    — the knowledge text (injected verbatim into system prompt)
 *   tags       — keywords for retrieval matching (e.g. ["ggplot2","visualization"])
 *   projectDir — optional workspace path this entry is scoped to
 *   source     — how the entry was created: 'manual' | 'agent' | 'imported'
 */

export type KnowledgeSource = 'manual' | 'agent' | 'imported';

export interface KnowledgeEntryJSON {
    id: string;
    title: string;
    content: string;
    tags: string[];
    projectDir?: string;
    source: KnowledgeSource;
    createdAt: string;
}

export class KnowledgeEntry {
    readonly createdAt: Date;

    constructor(
        readonly id: string,
        readonly title: string,
        readonly content: string,
        readonly tags: string[],
        readonly source: KnowledgeSource = 'manual',
        readonly projectDir?: string,
        createdAt?: Date,
    ) {
        this.createdAt = createdAt ?? new Date();
    }

    static create(
        title: string,
        content: string,
        tags: string[] = [],
        source: KnowledgeSource = 'manual',
        projectDir?: string,
    ): KnowledgeEntry {
        const id = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return new KnowledgeEntry(id, title, content, tags, source, projectDir);
    }

    toJSON(): KnowledgeEntryJSON {
        return {
            id: this.id,
            title: this.title,
            content: this.content,
            tags: [...this.tags],
            projectDir: this.projectDir,
            source: this.source,
            createdAt: this.createdAt.toISOString(),
        };
    }

    static fromJSON(data: KnowledgeEntryJSON): KnowledgeEntry {
        return new KnowledgeEntry(
            data.id,
            data.title,
            data.content,
            data.tags ?? [],
            data.source ?? 'manual',
            data.projectDir,
            new Date(data.createdAt),
        );
    }
}
