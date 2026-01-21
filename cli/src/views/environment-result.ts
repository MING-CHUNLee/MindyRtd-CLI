/**
 * View: Environment Result Formatter
 * 
 * Formats environment data for CLI display.
 * Following the MVC pattern where Views handle presentation logic.
 * 
 * Reference: NestJS Controller/Service separation, Ink CLI framework
 */

import { ContextSummary } from '../types/prompt-context';
import { EnvironmentReport, RHealthCheck, EnvironmentCapabilities } from '../types/environment';

/**
 * Format environment summary as a styled box for CLI display
 */
export function formatEnvironmentSummary(
    summary: ContextSummary,
    warnings: string[] = []
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
║    • R Scripts:    ${String(summary.fileTypes['R Scripts'] || 0).padEnd(38)}║
║    • R Markdown:   ${String(summary.fileTypes['R Markdown'] || 0).padEnd(38)}║
║    • R Data:       ${String(summary.fileTypes['R Data'] || 0).padEnd(38)}║
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
 * Format environment report (wrapper for convenience)
 */
export function formatEnvironmentReport(report: EnvironmentReport): string {
    return formatEnvironmentSummary(report.summary, report.warnings);
}

/**
 * Format R health check result
 */
export function formatRHealthCheck(health: RHealthCheck): string {
    const statusIcon = health.rAvailable ? '✓' : '✗';
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
 * Format environment capabilities as a table
 */
export function formatCapabilities(capabilities: EnvironmentCapabilities): string {
    const formatCap = (name: string, available: boolean): string => {
        const icon = available ? '✓' : '✗';
        const status = available ? 'Available' : 'Not Available';
        return `  ${icon} ${name.padEnd(20)} ${status}`;
    };

    return `
📊 Environment Capabilities
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatCap('Data Manipulation', capabilities.dataManipulation)}
${formatCap('Visualization', capabilities.visualization)}
${formatCap('Statistics', capabilities.statistics)}
${formatCap('Machine Learning', capabilities.machineLearning)}
${formatCap('Reporting', capabilities.reporting)}
${formatCap('Web Apps', capabilities.webApps)}
${formatCap('Database', capabilities.database)}
${formatCap('Excel I/O', capabilities.excelIO)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Format a compact one-line summary
 */
export function formatCompactSummary(summary: ContextSummary): string {
    const project = summary.projectName ? `[${summary.projectName}]` : '';
    return `R ${summary.rVersion} ${project} | ${summary.totalPackages} packages | ${summary.totalFiles} files`;
}
