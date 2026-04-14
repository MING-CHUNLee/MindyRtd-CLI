/**
 * CLI adapter: r
 *
 * Groups R language utility commands under a single top-level verb.
 *
 * Usage:
 *   mindy-cli r run [script]        → Execute R script / inline code
 *   mindy-cli r install <pkg...>    → Install R packages
 */

import { Command } from 'commander';
import { runCommand } from '../../application/controllers/run';
import { installCommand } from '../../application/controllers/install';

export const rCommand = new Command('r')
    .description('R language utilities — run scripts, manage packages, inspect environment')
    .addCommand(runCommand)
    .addCommand(installCommand);
