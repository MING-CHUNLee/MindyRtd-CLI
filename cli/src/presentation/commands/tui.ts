import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export const tuiCommand = new Command('tui')
    .alias('interactive')
    .description('Start interactive TUI mode with chat interface')
    .action(async () => {
        try {
            // Find the TUI entry point relative to this file's location
            // When installed globally, __dirname will be in node_modules/mindy-rstudio-cli/dist/presentation/commands
            // We need to go up to the package root and find src/presentation/tui/index.tsx

            const possiblePaths = [
                // From dist/presentation/commands -> ../../src/presentation/tui/index.tsx
                path.join(__dirname, '..', '..', '..', 'src', 'presentation', 'tui', 'index.tsx'),
                // From current directory (development mode)
                path.join(process.cwd(), 'src', 'presentation', 'tui', 'index.tsx'),
                // From cli subdirectory
                path.join(process.cwd(), 'cli', 'src', 'presentation', 'tui', 'index.tsx'),
            ];

            let srcPath: string | null = null;
            for (const testPath of possiblePaths) {
                if (fs.existsSync(testPath)) {
                    srcPath = testPath;
                    break;
                }
            }

            if (!srcPath) {
                console.error('Error: TUI source files not found.');
                console.error('Searched in:');
                possiblePaths.forEach(p => console.error(`  - ${p}`));
                process.exit(1);
            }

            // Use tsx to run the TUI directly
            // Quote the path to handle spaces in directory names (e.g., "OneDrive - NTHU")
            // Pass entire command as string to avoid DEP0190 deprecation warning
            const command = `npx tsx "${srcPath}"`;
            const tsx = spawn(command, [], {
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
