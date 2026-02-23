/**
 * Views: Banner
 * 
 * CLI banner display.
 */

import chalk from 'chalk';

export function getBanner(): string {
    return `
${chalk.cyan('╔═══════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.magenta('🔬 Mindy RStudio CLI')}                                 ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Intelligent R file analysis powered by LLM')}            ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════╝')}
`;
}

export function displayBanner(): void {
    console.log(getBanner());
}
