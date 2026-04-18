import { KnowledgeEntry } from '../entities/knowledge-entry';

export interface IKnowledgeRepository {
    load(): KnowledgeEntry[];
    add(entry: KnowledgeEntry): void;
    delete(id: string): boolean;
}
