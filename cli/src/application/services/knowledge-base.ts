/**
 * Service: KnowledgeBase
 *
 * Lightweight RAG (Retrieval-Augmented Generation) implementation.
 * No vector embeddings needed — keyword-based TF-IDF-style scoring.
 *
 * Retrieval strategy:
 *   1. Tokenize query into lowercase words
 *   2. Score each entry: matches in tags (×3) + matches in title (×2) + matches in content (×1)
 *   3. Return top-N entries by score (ties broken by recency)
 *
 * The KnowledgeBase is loaded from / persisted to KnowledgeRepository.
 * It holds entries in memory for fast repeated queries.
 */

import { KnowledgeEntry } from '../domain/entities/knowledge-entry';

export class KnowledgeBase {
    private _entries: KnowledgeEntry[] = [];

    // ── Load / Persist ────────────────────────────────────────────────────

    load(entries: KnowledgeEntry[]): void {
        this._entries = [...entries];
    }

    all(): KnowledgeEntry[] {
        return [...this._entries];
    }

    add(entry: KnowledgeEntry): void {
        this._entries.push(entry);
    }

    remove(id: string): boolean {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.id !== id);
        return this._entries.length < before;
    }

    // ── Retrieval ─────────────────────────────────────────────────────────

    /**
     * Find the most relevant entries for a natural-language query.
     *
     * @param query       The user's instruction or question
     * @param maxEntries  Maximum entries to return (default 3)
     * @param projectDir  If provided, global entries + project-scoped entries are returned
     */
    retrieve(query: string, maxEntries = 3, projectDir?: string): KnowledgeEntry[] {
        const tokens = tokenize(query);

        const scored = this._entries
            .filter(e => !e.projectDir || !projectDir || e.projectDir === projectDir)
            .map(entry => ({ entry, score: this.score(entry, tokens) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) =>
                b.score !== a.score
                    ? b.score - a.score
                    : b.entry.createdAt.getTime() - a.entry.createdAt.getTime(),
            );

        return scored.slice(0, maxEntries).map(s => s.entry);
    }

    // ── Scoring ───────────────────────────────────────────────────────────

    private score(entry: KnowledgeEntry, tokens: string[]): number {
        let score = 0;
        for (const token of tokens) {
            if (entry.tags.some(t => t.toLowerCase().includes(token)))    score += 3;
            if (entry.title.toLowerCase().includes(token))                 score += 2;
            if (entry.content.toLowerCase().includes(token))               score += 1;
        }
        return score;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tokenize a string into lowercase words, filtering stop words */
const STOP_WORDS = new Set([
    'a','an','the','is','it','in','on','at','to','for','of','and','or','but','not',
    'how','what','why','when','where','do','does','did','can','will','should','please',
]);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9_.\-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}
