/**
 * Types for R package installation
 */

// ============================================
// Installation Request/Response Types
// ============================================

export interface InstallationRequest {
    /** Package names to install */
    packages: string[];
    /** Installation source */
    source?: InstallationSource;
    /** CRAN repository URL */
    repos?: string;
    /** Whether to install dependencies */
    dependencies?: boolean;
    /** Installation timeout in milliseconds */
    timeout?: number;
}

export interface InstallationResponse {
    /** Unique installation ID */
    id: string;
    /** Current status */
    status: InstallationStatus;
    /** Successfully installed packages */
    installed?: string[];
    /** Failed packages */
    failed?: string[];
    /** Already installed packages (skipped) */
    skipped?: string[];
    /** Installation output/logs */
    output?: string;
    /** Error message if failed */
    error?: string;
    /** Installation duration in milliseconds */
    duration?: number;
}

export type InstallationSource =
    | 'cran'          // CRAN repository
    | 'github'        // GitHub repository
    | 'bioconductor'  // Bioconductor
    | 'local';        // Local file

export type InstallationStatus =
    | 'pending'       // Waiting to start
    | 'checking'      // Checking if packages exist
    | 'installing'    // Currently installing
    | 'completed'     // Successfully completed
    | 'partial'       // Some packages failed
    | 'error'         // Installation failed
    | 'rejected'      // User rejected installation
    | 'timeout';      // Installation timed out

// ============================================
// Command Options
// ============================================

export interface InstallCommandOptions {
    /** Skip confirmation prompt */
    yes: boolean;
    /** CRAN repository URL */
    repos?: string;
    /** Installation source */
    source: InstallationSource;
    /** Install dependencies */
    dependencies: boolean;
    /** Installation timeout in milliseconds */
    timeout: number;
    /** Output as JSON */
    json: boolean;
    /** Skip safety checks */
    skipSafety: boolean;
}

// ============================================
// Package Information
// ============================================

export interface PackageInfo {
    /** Package name */
    name: string;
    /** Whether package is already installed */
    installed: boolean;
    /** Current version (if installed) */
    version?: string;
    /** Available version */
    availableVersion?: string;
}
