/**
 * Universal prompt builder for all workflow modes.
 *
 * Mode-specific behaviour lives entirely in the agent/*.md policy files.
 * This builder simply composes the policy text with runtime context so that
 * adding a new mode never requires changing TypeScript — only a new .md file.
 */

export function buildModeAgentPrompt(
    policyText: string,
    directory: string,
    toolsText: string,
): string {
    const parts: string[] = [`Working directory: ${directory}`];
    if (policyText) parts.push(policyText);
    if (toolsText) parts.push(`## Available Tools\n${toolsText}`);
    return parts.join('\n\n');
}

/**
 * Lightweight variant for tutor modes (no tools text needed — tutors
 * do not call tools; they stream a conversational reply).
 */
export function buildTutorModePrompt(
    policyText: string,
    directory: string,
): string {
    const parts: string[] = [`Working directory: ${directory}`];
    if (policyText) parts.push(policyText);
    return parts.join('\n\n');
}
