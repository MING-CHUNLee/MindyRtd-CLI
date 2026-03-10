/**
 * Controller: plugins
 *
 * Manage the agent's plugin system — discover, list, and get info on
 * user-installed tool plugins from ~/.mindy/plugins/.
 *
 * Plugin format (CommonJS .js file):
 *   module.exports = {
 *     name: 'my_tool',
 *     schema: { name, description, parameters },
 *     execute: async (input) => ({ content: '...', isError: false })
 *   };
 *
 * Sub-commands:
 *   mindy plugins list       list all discovered plugins with load status
 *   mindy plugins dir        print the plugin directory path
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { PluginLoader } from '../../infrastructure/plugins/plugin-loader';
import { ToolRegistry } from '../../application/services/tool-registry';

export const pluginsCommand = new Command('plugins')
    .description('Manage agent tool plugins from ~/.mindy/plugins/')
    .addHelpText('after', `
Plugin format (save as ~/.mindy/plugins/<name>.js):
  module.exports = {
    name: 'my_tool',
    schema: {
      name: 'my_tool',
      description: 'What it does',
      parameters: { arg: { type: 'string', description: '...', required: true } }
    },
    execute: async (input) => ({ content: String(input.arg), isError: false })
  };
    `);

// ── list ──────────────────────────────────────────────────────────────────────

pluginsCommand
    .command('list')
    .description('List all discovered plugins with load status')
    .action(async () => {
        const loader = new PluginLoader();
        const registry = new ToolRegistry();
        const metas = await loader.loadAll(registry);

        const dir = loader.ensureDir();
        console.log(chalk.bold(`\n  Plugin directory: ${dir}`));

        if (metas.length === 0) {
            console.log(chalk.dim('\n  No plugins found.'));
            console.log(chalk.dim('  Drop a .js file into the plugin directory to install a plugin.'));
            return;
        }

        console.log(chalk.bold(`\n  ${metas.length} plugin(s) discovered:\n`));
        for (const m of metas) {
            const status = m.loaded
                ? chalk.green('✓ loaded')
                : chalk.red('✗ failed');
            const name = chalk.cyan(m.name.padEnd(18));
            const desc = m.loaded ? m.description : chalk.dim(m.error ?? 'error');
            console.log(`  ${status}  ${name}  ${desc}`);
            console.log(chalk.dim(`           ${path.basename(m.filePath)}`));
        }
    });

// ── dir ───────────────────────────────────────────────────────────────────────

pluginsCommand
    .command('dir')
    .description('Print the plugin directory path (creates it if missing)')
    .action(() => {
        const loader = new PluginLoader();
        console.log(loader.ensureDir());
    });
