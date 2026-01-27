#!/usr/bin/env node

/**
 * Mindy RStudio CLI
 * 
 * A CLI tool for detecting and analyzing R files in RStudio projects.
 * 
 * Architecture:
 * - commands/     : CLI command handlers (user-facing)
 * - controllers/  : API communication (LLM, external services)
 * - services/     : Business logic
 * - views/        : Output formatting
 * - types/        : TypeScript type definitions
 * - config/       : Environment configuration
 * - templates/    : Prompt templates + i18n
 * - data/         : Static data
 * - utils/        : Helper functions
 */

import { Command } from 'commander';
import { scanCommand } from './presentation/commands/scan';
import { libraryCommand } from './presentation/commands/library';
import { contextCommand } from './presentation/commands/context';
import { runCommand } from './presentation/commands/run';
import { displayBanner } from './presentation/views/banner';
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
program.addCommand(libraryCommand);
program.addCommand(contextCommand);
program.addCommand(runCommand);

// Default action
program.action(() => {
    displayBanner();
    program.help();
});

program.parse(process.argv);
