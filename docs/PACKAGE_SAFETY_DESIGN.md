# Package Safety Check Design

## Overview

Before installing R packages, perform multi-layered safety checks to ensure users don't install problematic packages.

---

## Safety Check Dimensions

### 1. **CRAN Official Status Check**
- ✅ Package exists on CRAN
- ✅ Package is not archived
- ✅ Last update time (outdated packages may be risky)

### 2. **Maintenance Status Check**
- ✅ Has active maintainer
- ✅ Recent commits/releases
- ✅ Not marked as orphaned

### 3. **Dependency Check**
- ✅ Number of dependencies (too many may be risky)
- ✅ Safety of dependency packages
- ✅ Circular dependency detection

### 4. **Community Trust**
- ✅ Download count (CRAN statistics)
- ✅ GitHub stars (if available)
- ✅ Maintained by known organizations/individuals

### 5. **Known Issues Check**
- ✅ Known security vulnerabilities
- ✅ Blacklist status
- ✅ Community-reported issues

---

## Implementation Design

### File Structure

```
cli/src/
├── core/
│   └── services/
│       ├── package-validator.ts          # Package validation service
│       └── package-safety-checker.ts     # Safety check logic
├── shared/
│   ├── types/
│   │   └── package-safety.ts             # Safety check types
│   └── data/
│       ├── package-blacklist.json        # Blacklist
│       └── trusted-maintainers.json      # Trusted maintainers list
└── infrastructure/
    └── config/
        └── constants.ts                  # Safety check constants
```

---

## Detailed Design

### 1. Type Definitions (`shared/types/package-safety.ts`)

```typescript
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
    | 'safe'        // Fully safe to install
    | 'warning'     // Has warnings, but installable
    | 'risky'       // Has risks, requires user confirmation
    | 'dangerous'   // Dangerous, strongly discouraged
    | 'blocked';    // Blocked, installation prevented

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
```

---

### 2. Data Sources

#### CRAN API
- **Endpoint**: `https://crandb.r-pkg.org/{package}`
- **Returns**: Package metadata (version, maintainer, dependencies, etc.)

#### CRAN Logs API
- **Endpoint**: `https://cranlogs.r-pkg.org/downloads/total/last-month/{package}`
- **Returns**: Download statistics

#### GitHub API (Optional)
- **Endpoint**: `https://api.github.com/repos/{owner}/{repo}`
- **Returns**: Repository metadata (stars, last update, etc.)

---

### 3. Safety Check Implementation

#### Blacklist Check
```typescript
async checkBlacklist(packageName: string): Promise<SafetyCheck> {
    const entry = blacklist.find(e => 
        e.package === packageName || 
        new RegExp(e.package).test(packageName)
    );

    if (entry) {
        return {
            name: 'Blacklist Check',
            category: 'known_issues',
            passed: false,
            severity: entry.severity === 'critical' ? 'critical' : 'error',
            message: `Package is blacklisted: ${entry.reason}`,
        };
    }

    return {
        name: 'Blacklist Check',
        category: 'known_issues',
        passed: true,
        severity: 'info',
        message: 'Package is not blacklisted',
    };
}
```

#### CRAN Status Check
```typescript
async checkCranStatus(metadata: PackageMetadata): Promise<SafetyCheck> {
    // Check if archived
    if (metadata.archived) {
        return {
            name: 'CRAN Status',
            category: 'cran_status',
            passed: false,
            severity: 'error',
            message: 'Package has been archived on CRAN (no longer maintained)',
        };
    }

    // Check last update time
    if (metadata.lastUpdate) {
        const daysSinceUpdate = getDaysSince(metadata.lastUpdate);
        
        if (daysSinceUpdate > MAX_DAYS_SINCE_UPDATE) {
            return {
                name: 'CRAN Status',
                category: 'cran_status',
                passed: false,
                severity: 'warning',
                message: `Package hasn't been updated in ${daysSinceUpdate} days`,
            };
        }
    }

    return {
        name: 'CRAN Status',
        category: 'cran_status',
        passed: true,
        severity: 'info',
        message: 'Package is active on CRAN',
    };
}
```

#### Maintenance Check
```typescript
async checkMaintenance(metadata: PackageMetadata): Promise<SafetyCheck> {
    // Check if maintainer is trusted
    const isTrusted = trustedMaintainers.some(tm =>
        metadata.maintainer?.includes(tm.identifier)
    );

    if (isTrusted) {
        return {
            name: 'Maintenance Status',
            category: 'maintenance',
            passed: true,
            severity: 'info',
            message: 'Maintained by trusted developer',
        };
    }

    // Check if maintainer info exists
    if (!metadata.maintainer || metadata.maintainer.includes('orphaned')) {
        return {
            name: 'Maintenance Status',
            category: 'maintenance',
            passed: false,
            severity: 'warning',
            message: 'Package appears to be orphaned (no active maintainer)',
        };
    }

    return {
        name: 'Maintenance Status',
        category: 'maintenance',
        passed: true,
        severity: 'info',
        message: 'Package has an active maintainer',
    };
}
```

#### Dependency Check
```typescript
async checkDependencies(metadata: PackageMetadata): Promise<SafetyCheck> {
    const depCount = metadata.dependencies?.length || 0;

    if (depCount > MAX_DEPENDENCIES) {
        return {
            name: 'Dependencies',
            category: 'dependencies',
            passed: false,
            severity: 'warning',
            message: `Package has ${depCount} dependencies (high complexity)`,
        };
    }

    return {
        name: 'Dependencies',
        category: 'dependencies',
        passed: true,
        severity: 'info',
        message: `Package has ${depCount} dependencies`,
    };
}
```

#### Community Trust Check
```typescript
async checkCommunityTrust(metadata: PackageMetadata): Promise<SafetyCheck> {
    const downloads = metadata.downloads || 0;

    if (downloads < MIN_MONTHLY_DOWNLOADS) {
        return {
            name: 'Community Trust',
            category: 'community_trust',
            passed: false,
            severity: 'warning',
            message: `Low download count (${downloads}/month). Package may not be widely used.`,
        };
    }

    return {
        name: 'Community Trust',
        category: 'community_trust',
        passed: true,
        severity: 'info',
        message: `Popular package (${downloads.toLocaleString()} downloads/month)`,
    };
}
```

#### License Check
```typescript
async checkLicense(metadata: PackageMetadata): Promise<SafetyCheck> {
    const license = metadata.license?.toLowerCase() || '';

    // List of acceptable licenses
    const acceptableLicenses = [
        'gpl', 'lgpl', 'mit', 'apache', 'bsd', 'cc0', 'artistic',
    ];

    const isAcceptable = acceptableLicenses.some(l => license.includes(l));

    if (!license) {
        return {
            name: 'License',
            category: 'license',
            passed: false,
            severity: 'warning',
            message: 'No license information available',
        };
    }

    if (!isAcceptable) {
        return {
            name: 'License',
            category: 'license',
            passed: false,
            severity: 'warning',
            message: `Unusual license: ${metadata.license}`,
        };
    }

    return {
        name: 'License',
        category: 'license',
        passed: true,
        severity: 'info',
        message: `Standard open-source license: ${metadata.license}`,
    };
}
```

---

### 4. Safety Level Calculation

```typescript
function calculateSafetyLevel(checks: SafetyCheck[]): SafetyLevel {
    const criticalFailed = checks.some(c => !c.passed && c.severity === 'critical');
    const errorFailed = checks.some(c => !c.passed && c.severity === 'error');
    const warningFailed = checks.some(c => !c.passed && c.severity === 'warning');

    if (criticalFailed) return 'blocked';
    if (errorFailed) return 'dangerous';
    if (warningFailed) return 'risky';
    
    const allPassed = checks.every(c => c.passed);
    return allPassed ? 'safe' : 'warning';
}
```

---

### 5. Configuration Constants

```typescript
export const SAFETY = {
    /** Maximum days since last update before warning */
    MAX_DAYS_SINCE_UPDATE: 730, // 2 years
    
    /** Maximum number of dependencies before warning */
    MAX_DEPENDENCIES: 50,
    
    /** Minimum monthly downloads to be considered popular */
    MIN_MONTHLY_DOWNLOADS: 100,
    
    /** Timeout for metadata fetch (10 seconds) */
    METADATA_FETCH_TIMEOUT_MS: 10_000,
    
    /** Timeout for stats fetch (5 seconds) */
    STATS_FETCH_TIMEOUT_MS: 5_000,
    
    /** Enable safety checks by default */
    ENABLE_SAFETY_CHECKS: true,
} as const;
```

---

### 6. Data Files

#### Blacklist Example (`shared/data/package-blacklist.json`)

```json
[
  {
    "package": "malicious-package",
    "reason": "Contains known malware",
    "dateAdded": "2026-01-01",
    "severity": "critical",
    "reference": "https://example.com/security-advisory"
  },
  {
    "package": "deprecated-pkg",
    "reason": "Deprecated and replaced by new-pkg",
    "dateAdded": "2025-12-01",
    "severity": "warning",
    "reference": "https://cran.r-project.org/package=deprecated-pkg"
  }
]
```

#### Trusted Maintainers Example (`shared/data/trusted-maintainers.json`)

```json
[
  {
    "identifier": "Hadley Wickham",
    "organization": "Posit (RStudio)",
    "trustLevel": "verified",
    "notablePackages": ["ggplot2", "dplyr", "tidyr", "purrr"]
  },
  {
    "identifier": "Yihui Xie",
    "organization": "Posit (RStudio)",
    "trustLevel": "verified",
    "notablePackages": ["knitr", "rmarkdown", "blogdown"]
  },
  {
    "identifier": "r-lib",
    "organization": "R-Lib",
    "trustLevel": "verified",
    "notablePackages": ["devtools", "usethis", "testthat"]
  },
  {
    "identifier": "tidyverse",
    "organization": "Tidyverse",
    "trustLevel": "verified",
    "notablePackages": ["dplyr", "ggplot2", "tidyr", "readr"]
  }
]
```

---

## User Experience Flow

### 1. Safe Package Installation

```
$ mindy-cli install dplyr

Package Installation
Source: cran
Repository: https://cran.rstudio.com
Dependencies: Yes

✓ Performing safety checks...

Safety Check Results:

✅ dplyr - SAFE
  ✓ Not blacklisted
  ✓ Active on CRAN
  ✓ Maintained by trusted developer (Hadley Wickham)
  ✓ Popular package (5,234,567 downloads/month)
  ✓ Standard open-source license: MIT

✓ Checking package status...

Already installed:
  ✓ dplyr (1.1.4)

All packages are already installed!
```

### 2. Risky Package Installation

```
$ mindy-cli install unknown-package

Package Installation
Source: cran
Repository: https://cran.rstudio.com
Dependencies: Yes

✓ Performing safety checks...

Safety Check Results:

⚠️  unknown-package - RISKY
  ⚠️  Low download count (45/month). Package may not be widely used.
  ⚠️  Package hasn't been updated in 856 days
  ⚠️  Package has 67 dependencies (high complexity)

⚠️  Warning: Some packages have safety concerns
? Do you still want to proceed? (y/N) n

Installation cancelled.
```

### 3. Blocked Package Installation

```
$ mindy-cli install malicious-package

Package Installation
Source: cran
Repository: https://cran.rstudio.com
Dependencies: Yes

✓ Performing safety checks...

Safety Check Results:

🚫 malicious-package - BLOCKED
  ❌ Package is blacklisted: Contains known malware

❌ Installation blocked for the following packages:
  • malicious-package: Package is blacklisted: Contains known malware
```

---

## Extensibility

### Future Enhancements

1. **CVE Database Integration**
   - Check against known vulnerabilities
   - Integrate with security advisory databases

2. **Code Scanning**
   - Static analysis of package code
   - Detect suspicious patterns

3. **Community Reporting**
   - Allow users to report suspicious packages
   - Crowdsourced blacklist

4. **Machine Learning**
   - Train models to detect malicious packages
   - Anomaly detection

5. **Automatic Updates**
   - Auto-update blacklist from trusted sources
   - Regular refresh of trusted maintainers list

---

## Configuration Options

Users can configure safety checks via environment variables or config file:

```typescript
// .env or config file
MINDY_SAFETY_ENABLED=true
MINDY_SAFETY_MAX_DAYS_SINCE_UPDATE=730
MINDY_SAFETY_MAX_DEPENDENCIES=50
MINDY_SAFETY_MIN_DOWNLOADS=100
```

---

## Testing Strategy

### Unit Tests
- Test each safety check individually
- Mock CRAN/GitHub API responses
- Test edge cases (missing data, API failures)

### Integration Tests
- Test full validation flow
- Test with real CRAN packages
- Test error handling

### Test Cases
1. ✅ Safe package (dplyr, ggplot2)
2. ⚠️ Outdated package (not updated in 3+ years)
3. ⚠️ Low download package (< 100 downloads/month)
4. ❌ Archived package
5. 🚫 Blacklisted package
6. ✅ Trusted maintainer package
7. ⚠️ High dependency count package
8. ⚠️ Unusual license package

---

## Performance Considerations

### Caching
- Cache CRAN metadata for 24 hours
- Cache download stats for 1 hour
- Cache GitHub data for 6 hours

### Parallel Checks
- Run independent checks in parallel
- Timeout individual checks to prevent blocking

### Graceful Degradation
- If API is unavailable, show warning but allow installation
- If cache is stale, use cached data with warning

---

## Privacy & Security

### Data Collection
- No user data is collected
- All checks are performed locally or via public APIs
- No telemetry or tracking

### API Keys
- GitHub API: Optional, increases rate limits
- CRAN API: Public, no authentication required

---

## Summary

The package safety check system provides:

✅ **Multi-layered validation** - Multiple independent checks  
✅ **Transparent reporting** - Clear explanation of issues  
✅ **User control** - Can skip checks if needed  
✅ **Extensible design** - Easy to add new checks  
✅ **Performance** - Fast checks with caching  
✅ **Privacy** - No data collection  

This ensures users can confidently install R packages while being aware of potential risks.
