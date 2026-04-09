/**
 * Views: Environment Result Formatter
 *
 * Formats R environment data for CLI display.
 *
 * Design rules (Presentation Layer SKILL.md):
 *   - All functions are PURE — return string only, no console.log.
 *   - No imports from domain/, application/, or infrastructure/.
 *   - Accepts EnvironmentSummaryVM (Presentation View Model) only.
 */

import { EnvironmentSummaryVM } from '../view-models';

// ─── Pure Formatters ───────────────────────────────────────────────────────

/**
 * Format environment summary as a styled ASCII box. Pure — returns string.
 */
export function formatEnvironmentSummary(
    summary: EnvironmentSummaryVM,
    warnings: string[] = [],
): string {
    let output = `
╔════════════════════════════════════════════════════════════╗
║                  R Environment Summary                      ║
╠════════════════════════════════════════════════════════════╣
║  R Version:     ${summary.rVersion.padEnd(40)}║
║  Project:       ${(summary.projectName || 'None').padEnd(40)}║
║  Packages:      ${String(summary.totalPackages).padEnd(40)}║
║  Files:         ${String(summary.totalFiles).padEnd(40)}║
╠════════════════════════════════════════════════════════════╣
║  Key Packages:                                              ║`;

    for (const pkg of summary.keyPackages.slice(0, 5)) {
        output += `\n║    • ${pkg.padEnd(52)}║`;
    }

    output += `
╠════════════════════════════════════════════════════════════╣
║  File Types:                                                ║
║    • R Scripts:    ${String(summary.fileTypes.rScripts).padEnd(38)}║
║    • R Markdown:   ${String(summary.fileTypes.rMarkdown).padEnd(38)}║
║    • R Data:       ${String(summary.fileTypes.rData).padEnd(38)}║
╚════════════════════════════════════════════════════════════╝`;

    if (warnings.length > 0) {
        output += '\n\n⚠️ Warnings:';
        for (const w of warnings) {
            output += `\n  - ${w}`;
        }
    }

    return output;
}

/**
 * Format R health check result. Pure — returns string.
 */
export function formatRHealthCheck(health: {
    rAvailable: boolean;
    rVersion: string;
    packagesCount: number;
    message: string;
}): string {
    const statusIcon  = health.rAvailable ? '✓' : '✗';
    const statusColor = health.rAvailable ? '🟢' : '🔴';

    return `
${statusColor} R Environment Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Status:    ${statusIcon} ${health.rAvailable ? 'Available' : 'Not Available'}
  Version:   ${health.rVersion}
  Packages:  ${health.packagesCount}
  Message:   ${health.message}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Format environment capabilities as a table. Pure — returns string.
 */
export function formatCapabilities(capabilities: {
    dataManipulation: boolean;
    visualization: boolean;
    statistics: boolean;
    machineLearning: boolean;
    reporting: boolean;
    webApps: boolean;
    database: boolean;
    excelIO: boolean;
}): string {
    const formatCap = (name: string, available: boolean): string => {
        const icon   = available ? '✓' : '✗';
        const status = available ? 'Available' : 'Not Available';
        return `  ${icon} ${name.padEnd(20)} ${status}`;
    };

    return `
📊 Environment Capabilities
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatCap('Data Manipulation', capabilities.dataManipulation)}
${formatCap('Visualization',     capabilities.visualization)}
${formatCap('Statistics',        capabilities.statistics)}
${formatCap('Machine Learning',  capabilities.machineLearning)}
${formatCap('Reporting',         capabilities.reporting)}
${formatCap('Web Apps',          capabilities.webApps)}
${formatCap('Database',          capabilities.database)}
${formatCap('Excel I/O',         capabilities.excelIO)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Format a compact one-line summary. Pure — returns string.
 */
export function formatCompactSummary(summary: EnvironmentSummaryVM): string {
    const project = summary.projectName ? `[${summary.projectName}]` : '';
    return `R ${summary.rVersion} ${project} | ${summary.totalPackages} packages | ${summary.totalFiles} files`;
}
