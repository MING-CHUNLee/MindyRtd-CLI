#!/usr/bin/env node

/**
 * Mindy RStudio CLI
 * 
 * A CLI tool for detecting and analyzing R files in RStudio projects.
 * 
 * Architecture:
 * - commands/  : CLI command handlers
 * - services/  : Business logic (local or API calls)
 * - views/     : Output formatting
 * - types/     : TypeScript type definitions
 * - utils/     : Helper functions
 */

import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { displayBanner } from './views/banner';
import { version } from '../package.json';

const program = new Command();

program
    .name('mindy-cli')
    .description('CLI tool for detecting and analyzing R files in RStudio projects')
    .version(version, '-v, --version', 'Display version number')
    .hook('preAction', () => {
        displayBanner();
    });

// Register commands
program.addCommand(scanCommand);

// Default action
program.action(() => {
    displayBanner();
    program.help();
});

program.parse(process.argv);
