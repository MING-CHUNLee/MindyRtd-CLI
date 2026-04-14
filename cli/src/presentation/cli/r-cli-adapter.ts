/**
 * CLI adapter: r
 *
 * Groups R language utility commands under a single top-level verb.
 *
 * Usage:
 *   mindy-cli r run [script]        → Execute R script / inline code
 *   mindy-cli r install <pkg...>    → Install R packages
 *   mindy-cli r context             → Preview generated system prompt (debug)
 */

import { Command } from 'commander';
import { runCommand } from '../../application/controllers/run';
import { installCommand } from '../../application/controllers/install';
import { contextCommand } from '../../application/controllers/context';

export const rCommand = new Command('r')
    .description('R language utilities — run scripts, manage packages, inspect environment')
    .addCommand(runCommand)
    .addCommand(installCommand)
    .addCommand(contextCommand);
