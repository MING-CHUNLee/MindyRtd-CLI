/**
 * Presentation View Models
 *
 * Flat, display-ready DTOs that cross the boundary between the Application
 * layer and the Presentation layer. Consumers of these types are view
 * formatters and TUI components — never domain entities.
 *
 * Rules (Martin Fowler — Presentation Model / Separated Presentation):
 *   - All fields must be primitive types (string, number, boolean) or arrays
 *     of primitives — no domain entities, no value objects.
 *   - Building View Models is the Application layer's responsibility
 *     (controllers / use-cases map domain → VM before handing off).
 *   - Presentation layer ONLY reads these; it never writes back to domain.
 *
 * References:
 *   Fowler — https://martinfowler.com/eaaDev/PresentationModel.html
 *   Khorikov — https://enterprisecraftsmanship.com/posts/dto-vs-value-object-vs-poco/
 */

// ─── Scan ──────────────────────────────────────────────────────────────────

export interface ScannedFileVM {
    path: string;
    size: number;
}

export interface ScanResultVM {
    rScripts: ScannedFileVM[];
    rMarkdown: ScannedFileVM[];
    rData: ScannedFileVM[];
    rProject: ScannedFileVM[];
    dataFiles: ScannedFileVM[];
    documents: ScannedFileVM[];
    totalFiles: number;
    projectName?: string;
    projectPath?: string;
    baseDir: string;
    maxFilesDisplay: number;
}

// ─── Environment / Context ─────────────────────────────────────────────────

export interface EnvironmentSummaryVM {
    rVersion: string;
    projectName: string;
    totalPackages: number;
    totalFiles: number;
    keyPackages: string[];
    fileTypes: {
        rScripts: number;
        rMarkdown: number;
        rData: number;
    };
}

export interface ContextPromptVM {
    estimatedTokens: number;
    charCount: number;
    systemPrompt: string;
}

export interface ContextDisplayVM {
    summary: EnvironmentSummaryVM;
    prompt: ContextPromptVM;
    warnings: string[];
    options: {
        showSummaryOnly: boolean;
        showTokenStats: boolean;
        lang: string;
        minimal: boolean;
    };
}

// ─── Library ───────────────────────────────────────────────────────────────

export interface LibraryInfoVM {
    name: string;
    version: string;
    isBase: boolean;
}

export interface LibraryScanResultVM {
    rVersion: string;
    rHome: string;
    libraryPaths: string[];
    totalLibraries: number;
    basePackages: number;
    userPackages: number;
    libraries: LibraryInfoVM[];
}

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

// ─── Status Bar ────────────────────────────────────────────────────────────

/**
 * Health level as a display string — no domain value object reference.
 */
export type ContextHealthVM = 'healthy' | 'warning' | 'critical' | 'overflow_risk';

export interface StatusBarVM {
    model: string;
    usagePercent: number;
    health: ContextHealthVM;
    totalCostUSD: number;
    turnCount: number;
    requestsPerMinute?: number;
    lastTokensPerSecond?: number;
    lastResponseTimeMs?: number;
    elapsedMs?: number;
}

export interface StatusBarDisplayConfig {
    items: StatusBarItemKey[];
    workflowMode?: string;
}

export type StatusBarItemKey =
    | 'mode'
    | 'model'
    | 'context'
    | 'rpm'
    | 'cost'
    | 'turn'
    | 'duration'
    | 'tps'
    | 'latency';
