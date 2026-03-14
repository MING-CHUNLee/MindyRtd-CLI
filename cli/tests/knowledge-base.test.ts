/**
 * Unit Tests: KnowledgeBase
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeBase } from '../src/application/services/knowledge-base';
import { KnowledgeEntry } from '../src/domain/entities/knowledge-entry';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
    title: string,
    content: string,
    tags: string[] = [],
    projectDir?: string,
): KnowledgeEntry {
    return KnowledgeEntry.create(title, content, tags, 'manual', projectDir);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KnowledgeBase', () => {
    describe('load / all / add / remove', () => {
        it('loads entries and lists them via all()', () => {
            const kb = new KnowledgeBase();
            const entries = [
                makeEntry('R tips', 'Use tidyverse'),
                makeEntry('ggplot2', 'Use aes()'),
            ];
            kb.load(entries);

            expect(kb.all()).toHaveLength(2);
        });

        it('add() appends an entry', () => {
            const kb = new KnowledgeBase();
            kb.load([]);
            kb.add(makeEntry('new tip', 'content'));

            expect(kb.all()).toHaveLength(1);
        });

        it('remove() deletes the entry by id and returns true', () => {
            const kb = new KnowledgeBase();
            const entry = makeEntry('delete me', 'remove this');
            kb.load([entry]);

            const removed = kb.remove(entry.id);

            expect(removed).toBe(true);
            expect(kb.all()).toHaveLength(0);
        });

        it('remove() returns false when id is not found', () => {
            const kb = new KnowledgeBase();
            kb.load([makeEntry('keep', 'content')]);

            expect(kb.remove('nonexistent-id')).toBe(false);
            expect(kb.all()).toHaveLength(1);
        });

        it('load() replaces existing entries', () => {
            const kb = new KnowledgeBase();
            kb.load([makeEntry('old', 'old content')]);
            kb.load([makeEntry('new1', ''), makeEntry('new2', '')]);

            expect(kb.all()).toHaveLength(2);
            expect(kb.all()[0].title).toBe('new1');
        });
    });

    describe('retrieve()', () => {
        it('returns top matching entries by score', () => {
            const kb = new KnowledgeBase();
            kb.load([
                makeEntry('ggplot2 guide', 'use aes for aesthetics', ['ggplot2', 'visualization']),
                makeEntry('dplyr tips', 'use mutate for new columns', ['dplyr', 'wrangling']),
                makeEntry('base R info', 'basic R syntax', ['base', 'r']),
            ]);

            const results = kb.retrieve('ggplot2 visualization aes');

            expect(results[0].title).toBe('ggplot2 guide');
        });

        it('returns empty array when no entries match', () => {
            const kb = new KnowledgeBase();
            kb.load([makeEntry('r stuff', 'r content', ['r'])]);

            const results = kb.retrieve('python django flask');

            expect(results).toHaveLength(0);
        });

        it('respects maxEntries limit', () => {
            const kb = new KnowledgeBase();
            kb.load([
                makeEntry('A', 'ggplot', ['ggplot']),
                makeEntry('B', 'ggplot color', ['ggplot']),
                makeEntry('C', 'ggplot theme', ['ggplot']),
                makeEntry('D', 'ggplot scale', ['ggplot']),
            ]);

            const results = kb.retrieve('ggplot', 2);

            expect(results).toHaveLength(2);
        });

        it('filters by projectDir when provided', () => {
            const kb = new KnowledgeBase();
            kb.load([
                makeEntry('global tip', 'global content', ['tip']),
                makeEntry('project tip', 'project content', ['tip'], '/project/A'),
                makeEntry('other project', 'other content', ['tip'], '/project/B'),
            ]);

            const results = kb.retrieve('tip', 10, '/project/A');

            const titles = results.map(r => r.title);
            expect(titles).toContain('global tip');
            expect(titles).toContain('project tip');
            expect(titles).not.toContain('other project');
        });

        it('scores tags higher than title, title higher than content', () => {
            const kb = new KnowledgeBase();
            const tagMatch = makeEntry('unrelated', 'unrelated', ['ggplot']);
            const titleMatch = makeEntry('ggplot guide', 'unrelated content', []);
            const contentMatch = makeEntry('unrelated title', 'ggplot is great', []);
            kb.load([contentMatch, titleMatch, tagMatch]);

            const results = kb.retrieve('ggplot', 3);

            expect(results[0].title).toBe('unrelated'); // tag match (score 3)
            expect(results[1].title).toBe('ggplot guide'); // title match (score 2)
            expect(results[2].title).toBe('unrelated title'); // content match (score 1)
        });

        it('filters out stop words from query', () => {
            const kb = new KnowledgeBase();
            kb.load([makeEntry('r tip', 'use the library', ['r', 'library'])]);

            // 'the' and 'a' are stop words — should still match on 'library'
            const results = kb.retrieve('how do the a library work');

            expect(results).toHaveLength(1);
        });
    });
});
