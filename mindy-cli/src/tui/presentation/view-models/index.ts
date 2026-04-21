/**
 * TUI-only Presentation View Models
 *
 * DTOs for tool-result cards rendered exclusively by TUI Ink components.
 * Scan/Library VMs (also used by CLI chalk views) live in shared/view-models.
 * StatusBar VMs also live there.
 */

// ─── R Execution ──────────────────────────────────────────────────────────

export interface RExecResultVM {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
}

// ─── R Install ────────────────────────────────────────────────────────────

export interface RInstallResultVM {
    packageName: string;
    success: boolean;
    message: string;
    version?: string;
}
