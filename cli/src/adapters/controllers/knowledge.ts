/**
 * Controller: knowledge
 *
 * Manage the agent's local knowledge base — add facts, project notes,
 * preferences, or any text the agent should remember across sessions.
 *
 * Stored at: ~/.mindy/knowledge.json
 *
 * Sub-commands:
 *   mindy knowledge add <title> <content>   add a new entry
 *   mindy knowledge list                    list all entries
 *   mindy knowledge search <query>          keyword search
 *   mindy knowledge remove <id>             delete an entry
 */

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';
import { KnowledgeBase } from '../../application/services/knowledge-base';
import { KnowledgeEntry } from '../../application/domain/entities/knowledge-entry';

const repo = new KnowledgeRepository();

export const knowledgeCommand = new Command('knowledge')
    .description('Manage the agent knowledge base (cross-session memory)')
    .addHelpText('after', `
Sub-commands:
  add      Add a knowledge entry
  list     List all entries
  search   Search entries by keyword
  remove   Delete an entry by ID
    `);

// ── add ───────────────────────────────────────────────────────────────────────

knowledgeCommand
    .command('add')
    .description('Add a knowledge entry')
    .argument('<title>', 'Short title / label')
    .argument('[content]', 'Knowledge text (omit to enter interactively)')
    .option('-t, --tags <tags>', 'Comma-separated tags, e.g. ggplot2,visualization')
    .option('-p, --project <dir>', 'Scope entry to a project directory')
    .action(async (title: string, content: string | undefined, options: { tags?: string; project?: string }) => {
        if (!content) {
            content = await promptMultiline(`Enter content for "${title}" (end with a blank line):`);
        }
        if (!content?.trim()) {
            console.error(chalk.red('Content is required.'));
            process.exit(1);
        }

        const tags = options.tags ? options.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const entry = KnowledgeEntry.create(title, content.trim(), tags, 'manual', options.project);
        repo.add(entry);

        console.log(chalk.green(`\n✓ Knowledge entry added (id: ${entry.id})`));
        console.log(chalk.dim(`  Title: ${entry.title}`));
        if (tags.length) console.log(chalk.dim(`  Tags:  ${tags.join(', ')}`));
    });

// ── list ──────────────────────────────────────────────────────────────────────

knowledgeCommand
    .command('list')
    .description('List all knowledge entries')
    .option('-p, --project <dir>', 'Filter by project directory')
    .action((options: { project?: string }) => {
        const entries = repo.load().filter(e =>
            !options.project || !e.projectDir || e.projectDir === options.project,
        );

        if (entries.length === 0) {
            console.log(chalk.dim('\n  No knowledge entries found.'));
            console.log(chalk.dim('  Add one with: mindy knowledge add "<title>" "<content>"'));
            return;
        }

        console.log(chalk.bold(`\n  Knowledge Base — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}\n`));
        for (const e of entries) {
            const scope = e.projectDir ? chalk.dim(` [${e.projectDir}]`) : '';
            const tags  = e.tags.length ? chalk.cyan(` [${e.tags.join(',')}]`) : '';
            const date  = chalk.dim(e.createdAt.toLocaleDateString());
            console.log(`  ${chalk.bold(e.id.slice(-6))}  ${e.title}${tags}${scope}  ${date}`);
            console.log(`       ${e.content.slice(0, 100)}${e.content.length > 100 ? '…' : ''}`);
        }
    });

// ── search ────────────────────────────────────────────────────────────────────

knowledgeCommand
    .command('search')
    .description('Search knowledge entries by keyword')
    .argument('<query>', 'Search query')
    .option('-n, --max <n>', 'Max results to show', '5')
    .action((query: string, options: { max: string }) => {
        const kb = new KnowledgeBase();
        kb.load(repo.load());

        const results = kb.retrieve(query, parseInt(options.max, 10));
        if (results.length === 0) {
            console.log(chalk.dim(`\n  No entries matched "${query}".`));
            return;
        }

        console.log(chalk.bold(`\n  Search: "${query}" — ${results.length} result(s)\n`));
        for (const e of results) {
            const tags = e.tags.length ? chalk.cyan(` [${e.tags.join(',')}]`) : '';
            console.log(`  ${chalk.bold(e.id.slice(-6))}  ${e.title}${tags}`);
            console.log(`       ${e.content.slice(0, 120)}${e.content.length > 120 ? '…' : ''}`);
        }
    });

// ── remove ────────────────────────────────────────────────────────────────────

knowledgeCommand
    .command('remove')
    .description('Delete a knowledge entry by ID')
    .argument('<id>', 'Entry ID (or last 6 characters of ID)')
    .action((id: string) => {
        const entries = repo.load();
        const match = entries.find(e => e.id === id || e.id.endsWith(id));
        if (!match) {
            console.error(chalk.red(`Entry not found: ${id}`));
            process.exit(1);
        }
        repo.delete(match.id);
        console.log(chalk.green(`✓ Removed: ${match.title} (${match.id.slice(-6)})`));
    });

// ── Helpers ───────────────────────────────────────────────────────────────────

function promptMultiline(prompt: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.yellow(prompt));
    const lines: string[] = [];
    return new Promise(resolve => {
        rl.on('line', line => {
            if (line === '') { rl.close(); resolve(lines.join('\n')); }
            else lines.push(line);
        });
    });
}
