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
import { installCommand } from './presentation/commands/install';
import { tuiCommand } from './presentation/commands/tui';
import { displayBanner } from './presentation/views/banner';
import fs from 'fs';
import path from 'path';

// Read version from package.json
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

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
program.addCommand(installCommand);
program.addCommand(tuiCommand);

// Default action - Launch TUI when no command is specified
program.action(async () => {
    displayBanner();
    console.log('\n🚀 Launching interactive mode...\n');

    // Import and start TUI dynamically
    try {
        const { spawn } = await import('child_process');
        const path = await import('path');
        const fs = await import('fs');

        // Try multiple possible locations for TUI files
        const possiblePaths = [
            // Development mode (from project root)
            path.join(process.cwd(), 'src', 'presentation', 'tui', 'index.tsx'),
            // Development mode (from cli directory)
            path.join(process.cwd(), 'cli', 'src', 'presentation', 'tui', 'index.tsx'),
            // Relative to this file (when running from dist)
            path.join(__dirname, '..', 'src', 'presentation', 'tui', 'index.tsx'),
        ];

        let tuiPath: string | null = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                tuiPath = testPath;
                break;
            }
        }

        if (!tuiPath) {
            console.error('❌ TUI source files not found.');
            console.log('\n💡 Searched in:');
            possiblePaths.forEach(p => console.log(`   - ${p}`));
            console.log('\n💡 Available commands:');
            program.help();
            return;
        }

        console.log(`📂 Using TUI from: ${tuiPath}\n`);

        // Quote the path to handle spaces in directory names (e.g., "OneDrive - NTHU")
        // Pass entire command as string to avoid DEP0190 deprecation warning
        const command = `npx tsx "${tuiPath}"`;
        const tsx = spawn(command, [], {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd(),
        });

        tsx.on('error', (error) => {
            console.error('❌ Error starting TUI:', error);
            console.log('\n💡 Falling back to command list:');
            program.help();
        });

        tsx.on('exit', (code) => {
            process.exit(code || 0);
        });
    } catch (error) {
        console.error('❌ Error launching TUI:', error);
        console.log('\n💡 Available commands:');
        program.help();
    }
});

program.parse(process.argv);
