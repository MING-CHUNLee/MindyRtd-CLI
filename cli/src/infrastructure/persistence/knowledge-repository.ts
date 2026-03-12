/**
 * Infrastructure: KnowledgeRepository
 *
 * Stores the knowledge base as a JSON file at <cwd>/.mindy/knowledge.json.
 * Provides load/save/list/delete operations.
 */

import fs from 'fs';
import { KnowledgeEntry, KnowledgeEntryJSON } from '../../domain/entities/knowledge-entry';
import { getProjectBase, getKnowledgeFile } from '../config/paths';

export class KnowledgeRepository {
    private readonly filePath: string;

    constructor() {
        getProjectBase(); // ensures .mindy/ dir exists
        this.filePath = getKnowledgeFile();
    }

    load(): KnowledgeEntry[] {
        if (!fs.existsSync(this.filePath)) return [];
        try {
            const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as KnowledgeEntryJSON[];
            return Array.isArray(data) ? data.map(KnowledgeEntry.fromJSON) : [];
        } catch {
            return [];
        }
    }

    save(entries: KnowledgeEntry[]): void {
        fs.writeFileSync(
            this.filePath,
            JSON.stringify(entries.map(e => e.toJSON()), null, 2),
            'utf-8',
        );
    }

    add(entry: KnowledgeEntry): void {
        const entries = this.load();
        entries.push(entry);
        this.save(entries);
    }

    delete(id: string): boolean {
        const entries = this.load();
        const filtered = entries.filter(e => e.id !== id);
        if (filtered.length === entries.length) return false;
        this.save(filtered);
        return true;
    }
}
