/**
 * Service: Package Validator
 *
 * Validates R packages before installation.
 */

import axios from 'axios';
import {
    PackageSafetyReport,
    PackageMetadata,
    SafetyCheck,
    SafetyLevel,
} from '../../shared/types/package-safety';
import { PackageSafetyChecker } from './package-safety-checker';
import { SAFETY } from '../../infrastructure/config/constants';

/**
 * HTTP client interface for dependency injection.
 * Compatible with axios — allows mock injection in tests.
 */
export interface HttpClient {
    get(url: string, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: any }>;
}

export class PackageValidator {
    constructor(
        private safetyChecker: PackageSafetyChecker = new PackageSafetyChecker(),
        private httpClient: HttpClient = axios
    ) { }

    /**
     * Validate a package before installation
     */
    async validate(
        packageName: string,
        source: string = 'cran'
    ): Promise<PackageSafetyReport> {
        const checks: SafetyCheck[] = [];
        const warnings: string[] = [];
        const errors: string[] = [];
        const recommendations: string[] = [];

        try {
            // 1. Fetch package metadata
            const metadata = await this.fetchPackageMetadata(
                packageName,
                source
            );

            // 2. Check blacklist
            const blacklistCheck =
                await this.safetyChecker.checkBlacklist(packageName);
            checks.push(blacklistCheck);
            if (!blacklistCheck.passed) {
                errors.push(blacklistCheck.message);
            }

            // 3. Check CRAN status
            if (source === 'cran') {
                const cranCheck =
                    await this.safetyChecker.checkCranStatus(metadata);
                checks.push(cranCheck);
                if (!cranCheck.passed && cranCheck.severity === 'error') {
                    errors.push(cranCheck.message);
                } else if (!cranCheck.passed) {
                    warnings.push(cranCheck.message);
                }
            }

            // 4. Check maintenance status
            const maintenanceCheck =
                await this.safetyChecker.checkMaintenance(metadata);
            checks.push(maintenanceCheck);
            if (!maintenanceCheck.passed) {
                warnings.push(maintenanceCheck.message);
            }

            // 5. Check dependencies
            const depsCheck =
                await this.safetyChecker.checkDependencies(metadata);
            checks.push(depsCheck);
            if (!depsCheck.passed) {
                warnings.push(depsCheck.message);
            }

            // 6. Check community trust
            const trustCheck =
                await this.safetyChecker.checkCommunityTrust(metadata);
            checks.push(trustCheck);
            if (!trustCheck.passed) {
                recommendations.push(trustCheck.message);
            }

            // 7. Check license
            const licenseCheck =
                await this.safetyChecker.checkLicense(metadata);
            checks.push(licenseCheck);
            if (!licenseCheck.passed) {
                warnings.push(licenseCheck.message);
            }

            // Determine overall safety level
            const safetyLevel = this.calculateSafetyLevel(checks);
            const allowInstallation = this.shouldAllowInstallation(
                safetyLevel,
                errors
            );

            return {
                packageName,
                safetyLevel,
                checks,
                warnings,
                errors,
                recommendations,
                allowInstallation,
            };
        } catch (error: any) {
            // If we can't validate, treat as risky
            return {
                packageName,
                safetyLevel: 'risky',
                checks,
                warnings: ['Unable to perform complete safety check'],
                errors: [`Validation error: ${error.message}`],
                recommendations: ['Proceed with caution'],
                allowInstallation: false,
            };
        }
    }

    /**
     * Fetch package metadata from CRAN or other sources
     */
    private async fetchPackageMetadata(
        packageName: string,
        source: string
    ): Promise<PackageMetadata> {
        if (source === 'cran') {
            return this.fetchCranMetadata(packageName);
        } else if (source === 'github') {
            return this.fetchGithubMetadata(packageName);
        }

        throw new Error(`Unsupported source: ${source}`);
    }

    /**
     * Fetch metadata from CRAN
     */
    private async fetchCranMetadata(
        packageName: string
    ): Promise<PackageMetadata> {
        try {
            // CRAN API endpoint
            const url = `https://crandb.r-pkg.org/${packageName}`;
            const response = await this.httpClient.get(url, {
                timeout: SAFETY.METADATA_FETCH_TIMEOUT_MS,
            });

            const data = response.data;

            // Fetch download stats
            const downloads = await this.fetchDownloadStats(packageName);

            return {
                name: packageName,
                version: data.Version,
                title: data.Title,
                description: data.Description,
                authors: this.parseAuthors(data.Author),
                maintainer: data.Maintainer,
                license: data.License,
                dependencies: this.parseDependencies(
                    data.Imports,
                    data.Depends
                ),
                published: data.Published ? new Date(data.Published) : undefined,
                lastUpdate: data.Date ? new Date(data.Date) : undefined,
                cranUrl: `https://cran.r-project.org/package=${packageName}`,
                githubUrl: this.extractGithubUrl(data),
                downloads,
                archived: data.archived || false,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                throw new Error(`Package '${packageName}' not found on CRAN`);
            }
            throw error;
        }
    }

    /**
     * Fetch GitHub metadata
     */
    private async fetchGithubMetadata(
        packageName: string
    ): Promise<PackageMetadata> {
        // Parse GitHub repo (format: owner/repo)
        const [owner, repo] = packageName.split('/');

        if (!owner || !repo) {
            throw new Error('Invalid GitHub package format. Use: owner/repo');
        }

        try {
            const url = `https://api.github.com/repos/${owner}/${repo}`;
            const response = await this.httpClient.get(url, {
                timeout: SAFETY.METADATA_FETCH_TIMEOUT_MS,
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                },
            });

            const data = response.data;

            return {
                name: packageName,
                title: data.description,
                description: data.description,
                published: new Date(data.created_at),
                lastUpdate: new Date(data.updated_at),
                githubUrl: data.html_url,
                archived: data.archived,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                throw new Error(
                    `GitHub repository '${packageName}' not found`
                );
            }
            throw error;
        }
    }

    /**
     * Fetch download statistics from CRAN
     */
    private async fetchDownloadStats(packageName: string): Promise<number> {
        try {
            // Use cranlogs API for download stats (last month)
            const url = `https://cranlogs.r-pkg.org/downloads/total/last-month/${packageName}`;
            const response = await this.httpClient.get(url, {
                timeout: SAFETY.STATS_FETCH_TIMEOUT_MS,
            });

            return response.data[0]?.downloads || 0;
        } catch {
            return 0; // If stats unavailable, return 0
        }
    }

    /**
     * Calculate overall safety level
     */
    private calculateSafetyLevel(checks: SafetyCheck[]): SafetyLevel {
        const criticalFailed = checks.some(
            (c) => !c.passed && c.severity === 'critical'
        );
        const errorFailed = checks.some(
            (c) => !c.passed && c.severity === 'error'
        );
        const warningFailed = checks.some(
            (c) => !c.passed && c.severity === 'warning'
        );

        if (criticalFailed) return 'blocked';
        if (errorFailed) return 'dangerous';
        if (warningFailed) return 'risky';

        const allPassed = checks.every((c) => c.passed);
        return allPassed ? 'safe' : 'warning';
    }

    /**
     * Determine if installation should be allowed
     */
    private shouldAllowInstallation(
        level: SafetyLevel,
        errors: string[]
    ): boolean {
        if (level === 'blocked') return false;
        if (errors.length > 0) return false;
        return true;
    }

    // ============================================
    // Helper Methods
    // ============================================

    private parseAuthors(authorString?: any): string[] {
        if (!authorString) return [];
        // Convert to string if needed
        const authStr = typeof authorString === 'string' ? authorString : String(authorString);
        // Simple parsing - can be improved
        return authStr.split(',').map((a) => a.trim());
    }

    private parseDependencies(imports?: any, depends?: any): string[] {
        const deps: string[] = [];

        // Convert to string if needed
        const importsStr = typeof imports === 'string' ? imports :
            imports ? String(imports) : '';
        const dependsStr = typeof depends === 'string' ? depends :
            depends ? String(depends) : '';

        if (importsStr) {
            deps.push(
                ...importsStr
                    .split(',')
                    .map((d) => d.trim().split(/\s+/)[0])
            );
        }
        if (dependsStr) {
            deps.push(
                ...dependsStr
                    .split(',')
                    .map((d) => d.trim().split(/\s+/)[0])
            );
        }

        return deps.filter((d) => d && d !== 'R');
    }

    private extractGithubUrl(cranData: any): string | undefined {
        // Try to extract GitHub URL from BugReports or URL fields
        const url = cranData.BugReports || cranData.URL || '';
        const match = url.match(/github\.com\/([^\/]+\/[^\/\s,]+)/);
        return match ? `https://github.com/${match[1]}` : undefined;
    }
}
