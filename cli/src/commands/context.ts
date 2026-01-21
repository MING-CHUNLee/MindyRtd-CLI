/**
 * Command: context
 * 
 * Preview the generated system prompt without calling LLM API.
 * Useful for testing and debugging the context-builder output.
 * 
 * Usage:
 *   mindy context              # Preview prompt
 *   mindy context --json       # Output as JSON
 *   mindy context --save       # Save to file
 *   mindy context --lang zh-TW # Chinese prompt
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { REnvironmentService } from '../services/r-environment-service';
import { formatEnvironmentSummary } from '../views/environment-result';

export const contextCommand = new Command('context')
    .alias('ctx')
    .alias('prompt')
    .description('Preview the generated system prompt (for testing without LLM)')
    .option('-d, --dir <directory>', 'Target directory to scan', process.cwd())
    .option('-l, --lang <language>', 'Prompt language: en, zh-TW', 'en')
    .option('--include-base', 'Include base R packages', false)
    .option('-j, --json', 'Output as JSON', false)
    .option('-s, --save <filename>', 'Save prompt to file')
    .option('--minimal', 'Generate minimal prompt (fewer tokens)', false)
    .option('--summary', 'Show only summary, not full prompt', false)
    .option('--tokens', 'Show estimated token count', false)
    .action(async (options) => {
        const spinner = ora({
            text: 'Scanning environment and building context...',
            color: 'cyan',
        }).start();

        try {
            // Create service with options
            const service = new REnvironmentService({
                workingDir: options.dir,
                includeBasePackages: options.includeBase,
                contextOptions: {
                    language: options.lang as 'en' | 'zh-TW',
                    includePackageDetails: !options.minimal,
                    includeFilePreview: !options.minimal,
                    maxPackagesToList: options.minimal ? 10 : 50,
                    maxFilesToList: options.minimal ? 5 : 20,
                },
            });

            // Get the full report
            const report = await service.getEnvironmentReport();
            const { prompt, summary, warnings } = report;

            spinner.succeed(chalk.green('Context built successfully!'));

            // JSON output
            if (options.json) {
                const output = {
                    summary: {
                        rVersion: summary.rVersion,
                        projectName: summary.projectName,
                        totalPackages: summary.totalPackages,
                        totalFiles: summary.totalFiles,
                        keyPackages: summary.keyPackages,
                        fileTypes: summary.fileTypes,
                    },
                    prompt: {
                        estimatedTokens: prompt.estimatedTokens,
                        length: prompt.systemPrompt.length,
                        content: options.summary ? '[Use --no-summary to see full content]' : prompt.systemPrompt,
                    },
                    warnings,
                    generatedAt: new Date().toISOString(),
                };
                console.log(JSON.stringify(output, null, 2));
                return;
            }

            // Display header
            console.log('');
            console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));
            console.log(chalk.bold.cyan('                    CONTEXT PREVIEW                              '));
            console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════'));

            // Show environment summary
            console.log('');
            console.log(chalk.bold.yellow('📊 Environment Summary:'));
            console.log(formatEnvironmentSummary(summary, warnings));

            // Show token info
            if (options.tokens || !options.summary) {
                console.log('');
                console.log(chalk.bold.yellow('📈 Prompt Statistics:'));
                console.log(`   • Estimated Tokens: ${chalk.cyan(prompt.estimatedTokens.toLocaleString())}`);
                console.log(`   • Character Count:  ${chalk.cyan(prompt.systemPrompt.length.toLocaleString())}`);
                console.log(`   • Language:         ${chalk.cyan(options.lang)}`);
                console.log(`   • Mode:             ${chalk.cyan(options.minimal ? 'Minimal' : 'Full')}`);
            }

            // Show full prompt unless --summary
            if (!options.summary) {
                console.log('');
                console.log(chalk.bold.yellow('📝 Generated System Prompt:'));
                console.log(chalk.gray('─'.repeat(65)));
                console.log('');

                // Syntax highlight the prompt
                const highlighted = highlightPrompt(prompt.systemPrompt);
                console.log(highlighted);

                console.log('');
                console.log(chalk.gray('─'.repeat(65)));
            }

            // Save to file if requested
            if (options.save) {
                const filename = options.save.endsWith('.md') ? options.save : `${options.save}.md`;
                const filePath = path.resolve(process.cwd(), filename);

                const fileContent = `# Generated System Prompt

Generated at: ${new Date().toISOString()}
Language: ${options.lang}
Mode: ${options.minimal ? 'Minimal' : 'Full'}
Estimated Tokens: ${prompt.estimatedTokens}

---

${prompt.systemPrompt}
`;

                fs.writeFileSync(filePath, fileContent, 'utf-8');
                console.log('');
                console.log(chalk.green(`✓ Prompt saved to: ${filePath}`));
            }

            // Show tips
            console.log('');
            console.log(chalk.gray('💡 Tips:'));
            console.log(chalk.gray('   • Use --json for machine-readable output'));
            console.log(chalk.gray('   • Use --minimal for smaller prompts'));
            console.log(chalk.gray('   • Use --save <filename> to save prompt to file'));
            console.log(chalk.gray('   • Use --lang zh-TW for Traditional Chinese'));

        } catch (error) {
            spinner.fail(chalk.red('Failed to build context'));
            console.error(chalk.red(`Error: ${(error as Error).message}`));
            process.exit(1);
        }
    });

/**
 * Add syntax highlighting to the prompt for better readability
 */
function highlightPrompt(prompt: string): string {
    return prompt
        // Highlight headers
        .replace(/^# (.+)$/gm, chalk.bold.magenta('# $1'))
        .replace(/^## (.+)$/gm, chalk.bold.blue('## $1'))
        // Highlight bold text
        .replace(/\*\*([^*]+)\*\*/g, chalk.bold('$1'))
        // Highlight bullet points
        .replace(/^(- .+)$/gm, chalk.white('$1'))
        // Highlight code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
            chalk.gray('```' + (lang || '')) + '\n' + chalk.green(code) + chalk.gray('```')
        )
        // Highlight inline code
        .replace(/`([^`]+)`/g, chalk.cyan('`$1`'))
        // Highlight checkmarks
        .replace(/✓/g, chalk.green('✓'))
        .replace(/✗/g, chalk.red('✗'));
}
