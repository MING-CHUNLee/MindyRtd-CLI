/**
 * Types for package safety checks
 */

// ============================================
// Safety Check Types
// ============================================

export interface PackageSafetyReport {
    /** Package name */
    packageName: string;
    /** Overall safety level */
    safetyLevel: SafetyLevel;
    /** Individual check results */
    checks: SafetyCheck[];
    /** Warnings */
    warnings: string[];
    /** Errors (blocking issues) */
    errors: string[];
    /** Recommendations */
    recommendations: string[];
    /** Whether installation should be allowed */
    allowInstallation: boolean;
}

export type SafetyLevel =
    | 'safe'        // 完全安全，可以安裝
    | 'warning'     // 有警告，但可以安裝
    | 'risky'       // 有風險，需要使用者確認
    | 'dangerous'   // 危險，強烈不建議安裝
    | 'blocked';    // 被封鎖，不允許安裝

export interface SafetyCheck {
    /** Check name */
    name: string;
    /** Check category */
    category: SafetyCheckCategory;
    /** Check result */
    passed: boolean;
    /** Severity if failed */
    severity: 'info' | 'warning' | 'error' | 'critical';
    /** Detailed message */
    message: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
}

export type SafetyCheckCategory =
    | 'cran_status'
    | 'maintenance'
    | 'dependencies'
    | 'community_trust'
    | 'known_issues'
    | 'license'
    | 'source_verification';

// ============================================
// Package Metadata
// ============================================

export interface PackageMetadata {
    /** Package name */
    name: string;
    /** Version */
    version?: string;
    /** Title */
    title?: string;
    /** Description */
    description?: string;
    /** Author(s) */
    authors?: string[];
    /** Maintainer */
    maintainer?: string;
    /** License */
    license?: string;
    /** Dependencies */
    dependencies?: string[];
    /** Publication date */
    published?: Date;
    /** Last update date */
    lastUpdate?: Date;
    /** CRAN URL */
    cranUrl?: string;
    /** GitHub URL */
    githubUrl?: string;
    /** Download count (monthly) */
    downloads?: number;
    /** Is archived */
    archived?: boolean;
}

// ============================================
// Blacklist & Whitelist
// ============================================

export interface BlacklistEntry {
    /** Package name or pattern */
    package: string;
    /** Reason for blacklisting */
    reason: string;
    /** Date added */
    dateAdded: string;
    /** Severity */
    severity: 'warning' | 'error' | 'critical';
    /** Reference URL */
    reference?: string;
}

export interface TrustedMaintainer {
    /** Maintainer name or email */
    identifier: string;
    /** Organization (if any) */
    organization?: string;
    /** Trust level */
    trustLevel: 'verified' | 'trusted' | 'known';
    /** Notable packages */
    notablePackages?: string[];
}
