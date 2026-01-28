/**
 * Service: Package Safety Checker
 *
 * Individual safety check implementations.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    SafetyCheck,
    PackageMetadata,
    BlacklistEntry,
    TrustedMaintainer,
} from '../../shared/types/package-safety';
import { SAFETY } from '../../infrastructure/config/constants';

export class PackageSafetyChecker {
    private blacklist: BlacklistEntry[];
    private trustedMaintainers: TrustedMaintainer[];

    constructor() {
        this.blacklist = this.loadBlacklist();
        this.trustedMaintainers = this.loadTrustedMaintainers();
    }

    /**
     * Check if package is blacklisted
     */
    async checkBlacklist(packageName: string): Promise<SafetyCheck> {
        const entry = this.blacklist.find(
            (e) =>
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
                metadata: { entry },
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

    /**
     * Check CRAN status
     */
    async checkCranStatus(metadata: PackageMetadata): Promise<SafetyCheck> {
        // Check if archived
        if (metadata.archived) {
            return {
                name: 'CRAN Status',
                category: 'cran_status',
                passed: false,
                severity: 'error',
                message:
                    'Package has been archived on CRAN (no longer maintained)',
            };
        }

        // Check last update time
        if (metadata.lastUpdate) {
            const daysSinceUpdate = this.getDaysSince(metadata.lastUpdate);

            if (daysSinceUpdate > SAFETY.MAX_DAYS_SINCE_UPDATE) {
                return {
                    name: 'CRAN Status',
                    category: 'cran_status',
                    passed: false,
                    severity: 'warning',
                    message: `Package hasn't been updated in ${daysSinceUpdate} days`,
                    metadata: { daysSinceUpdate },
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

    /**
     * Check maintenance status
     */
    async checkMaintenance(metadata: PackageMetadata): Promise<SafetyCheck> {
        // Check if maintainer is trusted
        const isTrusted = this.trustedMaintainers.some((tm) =>
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

    /**
     * Check dependencies
     */
    async checkDependencies(metadata: PackageMetadata): Promise<SafetyCheck> {
        const depCount = metadata.dependencies?.length || 0;

        if (depCount > SAFETY.MAX_DEPENDENCIES) {
            return {
                name: 'Dependencies',
                category: 'dependencies',
                passed: false,
                severity: 'warning',
                message: `Package has ${depCount} dependencies (high complexity)`,
                metadata: { dependencyCount: depCount },
            };
        }

        return {
            name: 'Dependencies',
            category: 'dependencies',
            passed: true,
            severity: 'info',
            message: `Package has ${depCount} dependencies`,
            metadata: { dependencyCount: depCount },
        };
    }

    /**
     * Check community trust (download stats, etc.)
     */
    async checkCommunityTrust(
        metadata: PackageMetadata
    ): Promise<SafetyCheck> {
        const downloads = metadata.downloads || 0;

        if (downloads < SAFETY.MIN_MONTHLY_DOWNLOADS) {
            return {
                name: 'Community Trust',
                category: 'community_trust',
                passed: false,
                severity: 'warning',
                message: `Low download count (${downloads}/month). Package may not be widely used.`,
                metadata: { downloads },
            };
        }

        return {
            name: 'Community Trust',
            category: 'community_trust',
            passed: true,
            severity: 'info',
            message: `Popular package (${downloads.toLocaleString()} downloads/month)`,
            metadata: { downloads },
        };
    }

    /**
     * Check license
     */
    async checkLicense(metadata: PackageMetadata): Promise<SafetyCheck> {
        const license = metadata.license?.toLowerCase() || '';

        // List of acceptable licenses
        const acceptableLicenses = [
            'gpl',
            'lgpl',
            'mit',
            'apache',
            'bsd',
            'cc0',
            'artistic',
        ];

        const isAcceptable = acceptableLicenses.some((l) =>
            license.includes(l)
        );

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
                metadata: { license: metadata.license },
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

    // ============================================
    // Helper Methods
    // ============================================

    private getDaysSince(date: Date): number {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    private loadBlacklist(): BlacklistEntry[] {
        try {
            const filePath = path.join(
                __dirname,
                '../../shared/data/package-blacklist.json'
            );
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (error: any) {
            console.warn('Failed to load blacklist:', error.message);
        }
        return [];
    }

    private loadTrustedMaintainers(): TrustedMaintainer[] {
        try {
            const filePath = path.join(
                __dirname,
                '../../shared/data/trusted-maintainers.json'
            );
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (error: any) {
            console.warn('Failed to load trusted maintainers:', error.message);
        }
        return [];
    }
}
