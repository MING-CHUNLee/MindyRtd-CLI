/**
 * CLI adapter: config
 *
 * Groups low-frequency diagnostic / configuration commands.
 *
 * Usage:
 *   mindy-cli config plugins list   → List discovered plugins with load status
 *   mindy-cli config plugins dir    → Print plugin directory path
 */

import { Command } from 'commander';
import { pluginsCommand } from '../../application/controllers/plugins';

export const configCommand = new Command('config')
    .description('Diagnostic and configuration utilities')
    .addCommand(pluginsCommand);
