import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export const tuiCommand = new Command('tui')
    .alias('interactive')
    .description('Start interactive TUI mode with chat interface')
    .action(async () => {
        try {
            // Find the TUI entry point - check both src (dev) and dist (prod) locations
            const srcPath = path.join(process.cwd(), 'src', 'presentation', 'tui', 'index.tsx');

            if (!fs.existsSync(srcPath)) {
                console.error('Error: TUI source files not found.');
                console.error(`Expected location: ${srcPath}`);
                process.exit(1);
            }

            // Use tsx to run the TUI directly
            // Quote the path to handle spaces in directory names (e.g., "OneDrive - NTHU")
            const quotedSrcPath = `"${srcPath}"`;
            const tsx = spawn('npx', ['tsx', quotedSrcPath], {
                stdio: 'inherit',
                shell: true,
                cwd: process.cwd(),
            });

            tsx.on('error', (error) => {
                console.error('Error starting TUI:', error);
                process.exit(1);
            });

            tsx.on('exit', (code) => {
                process.exit(code || 0);
            });
        } catch (error) {
            console.error('Error starting TUI:', error);
            process.exit(1);
        }
    });
