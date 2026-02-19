/**
 * Service: Library Scanner
 *
 * Scans the R environment for installed libraries/packages.
 * Uses R commands to retrieve library information.
 *
 * Architecture Note:
 * - R path resolution is delegated to r-path-resolver.ts
 * - R script execution is delegated to r-script-runner.ts
 * - This module focuses purely on package scanning logic
 */

import {
    LibraryInfo,
    LibraryScanResult,
    LibraryScanOptions,
    createLibraryInfo,
    createLibraryScanResult
} from '../../shared/types/library-info';
import { LibraryScanError } from '../../shared/utils/errors';
import { findRscriptPath } from './r-path-resolver';
import { execRscriptCode } from './r-script-runner';

// ============================================
// R Script Templates
// ============================================

const GET_PACKAGES_SCRIPT = `
pkgs <- installed.packages()
for (i in 1:nrow(pkgs)) {
    cat(sprintf("%s|%s|%s|%s\\n", 
        pkgs[i, "Package"], 
        pkgs[i, "Version"], 
        ifelse(is.na(pkgs[i, "Priority"]), "", pkgs[i, "Priority"]),
        pkgs[i, "LibPath"]))
}
`;

const GET_R_INFO_SCRIPT = `
cat(sprintf("VERSION|%s\\n", paste(R.version$major, R.version$minor, sep=".")))
cat(sprintf("RHOME|%s\\n", R.home()))
cat(sprintf("LIBPATHS|%s\\n", paste(.libPaths(), collapse=";")))
`;

// ============================================
// Public API
// ============================================

/**
 * Scan for installed R libraries
 */
export async function scanLibraries(options: LibraryScanOptions): Promise<LibraryScanResult> {
    // Verify R is available (also caches the path)
    await findRscriptPath();

    const rInfo = await getRInfo();
    const libraries = await getInstalledPackages(options);

    return createLibraryScanResult({
        rVersion: rInfo.version,
        rHome: rInfo.rHome,
        libraryPaths: rInfo.libPaths,
        libraries,
    });
}

/**
 * Check if a specific package is installed
 */
export async function isPackageInstalled(packageName: string): Promise<boolean> {
    try {
        const script = `cat(require("${packageName}", quietly=TRUE))`;
        const { stdout } = await execRscriptCode(script);
        return stdout.trim() === 'TRUE';
    } catch {
        // Package not found or R error - return false as expected behavior
        return false;
    }
}

/**
 * Get detailed info about a specific package
 */
export async function getPackageInfo(packageName: string): Promise<LibraryInfo | null> {
    try {
        const script = `
if (requireNamespace("${packageName}", quietly = TRUE)) {
    desc <- packageDescription("${packageName}")
    cat(sprintf("%s|%s|%s|%s|%s\n",
        desc$Package,
        desc$Version,
        ifelse(is.null(desc$Priority), "", desc$Priority),
        .libPaths()[1],
        ifelse(is.null(desc$Title), "", desc$Title)))
}
`;
        const { stdout } = await execRscriptCode(script);

        const line = stdout.trim();
        if (!line) return null;

        const [name, version, priority, libraryPath, title] = line.split('|');
        const isBase = priority === 'base' || priority === 'recommended';

        return createLibraryInfo({
            name,
            version,
            title: title || undefined,
            libraryPath,
            isBase,
            priority: priority || undefined,
        });
    } catch {
        // Package info unavailable or R error - null indicates not found
        return null;
    }
}

// ============================================
// Internal Helpers
// ============================================

/**
 * Get R environment information
 */
async function getRInfo(): Promise<{ version: string; rHome: string; libPaths: string[] }> {
    try {
        const { stdout } = await execRscriptCode(GET_R_INFO_SCRIPT);

        const lines = stdout.trim().split('\n');
        let version = 'unknown';
        let rHome = '';
        let libPaths: string[] = [];

        for (const line of lines) {
            const [key, value] = line.split('|');
            if (key === 'VERSION') {
                version = value;
            } else if (key === 'RHOME') {
                rHome = value;
            } else if (key === 'LIBPATHS') {
                libPaths = value.split(';').filter(p => p.trim() !== '');
            }
        }

        return { version, rHome, libPaths };
    } catch (error) {
        throw new LibraryScanError(`Failed to get R info: ${(error as Error).message}`);
    }
}

/**
 * Get list of installed packages
 */
async function getInstalledPackages(options: LibraryScanOptions): Promise<LibraryInfo[]> {
    try {
        const { stdout } = await execRscriptCode(GET_PACKAGES_SCRIPT);

        const lines = stdout.trim().split('\n');
        const libraries: LibraryInfo[] = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            const parts = line.split('|');
            if (parts.length < 4) continue;

            const [name, version, priority, libraryPath] = parts;
            const isBase = priority === 'base' || priority === 'recommended';

            if (!options.includeBase && isBase) {
                continue;
            }

            if (options.filter) {
                const filterLower = options.filter.toLowerCase();
                if (!name.toLowerCase().includes(filterLower)) {
                    continue;
                }
            }

            libraries.push(createLibraryInfo({
                name,
                version,
                libraryPath,
                isBase,
                priority: priority || undefined,
            }));
        }

        libraries.sort((a, b) => {
            if (options.sortBy === 'version') {
                return b.version.localeCompare(a.version);
            }
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        return libraries;
    } catch (error) {
        throw new LibraryScanError(`Failed to get installed packages: ${(error as Error).message}`);
    }
}
