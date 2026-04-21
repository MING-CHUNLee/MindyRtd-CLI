import { IKnowledgeRepository } from '../../domain/interfaces/i-knowledge-repository';
import { KnowledgeEntry, type KnowledgeSource } from '../../domain/entities/knowledge-entry';
import { KnowledgeBase } from './knowledge-base';

export class KnowledgeService {
    constructor(private readonly repo: IKnowledgeRepository) {}

    add(title: string, content: string, tags: string[], source?: KnowledgeSource, projectDir?: string): { id: string; title: string } {
        const entry = KnowledgeEntry.create(title, content, tags, source ?? 'manual', projectDir);
        this.repo.add(entry);
        return { id: entry.id, title: entry.title };
    }

    list(projectDir?: string): KnowledgeEntry[] {
        return this.repo.load().filter(e =>
            !projectDir || !e.projectDir || e.projectDir === projectDir,
        );
    }

    search(query: string, max: number): KnowledgeEntry[] {
        const kb = new KnowledgeBase();
        kb.load(this.repo.load());
        return kb.retrieve(query, max);
    }

    /** Returns the matching entry, or undefined if not found. */
    remove(id: string): KnowledgeEntry | undefined {
        const match = this.repo.load().find(e => e.id === id || e.id.endsWith(id));
        if (!match) return undefined;
        this.repo.delete(match.id);
        return match;
    }
}
