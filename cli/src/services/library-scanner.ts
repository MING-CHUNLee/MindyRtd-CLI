/**
 * Service: Library Scanner
 * 
 * Scans the R environment for installed libraries/packages.
 * Uses R commands to retrieve library information.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
    LibraryInfo,
    LibraryScanResult,
    LibraryScanOptions,
    createLibraryInfo,
    createLibraryScanResult
} from '../types/library-info';
import { RNotFoundError, LibraryScanError } from '../utils/errors';

const execAsync = promisify(exec);

// Constants
const TEMP_SCRIPT_PREFIX = 'mindy_r_script_';
const TEMP_SCRIPT_EXTENSION = '.R';

// Cached Rscript path
let cachedRscriptPath: string | null = null;

// Detect current platform
const PLATFORM = process.platform;

/**
 * Sort strings in descending order (newest version first)
 * Used for version directory sorting to get the latest R version
 */
function sortDescending(a: string, b: string): number {
    return b.localeCompare(a);
}

// Common R installation paths by platform
const WINDOWS_R_PATHS = [
    'C:\\Program Files\\R',
    'C:\\Program Files (x86)\\R',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'R') : '',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'R') : '',
].filter(p => p !== '');

const MACOS_R_PATHS = [
    '/Library/Frameworks/R.framework/Versions',
    '/opt/homebrew/Cellar/r',        // Homebrew Apple Silicon
    '/usr/local/Cellar/r',           // Homebrew Intel
    '/opt/local/Library/Frameworks/R.framework/Versions', // MacPorts
    process.env.HOME ? path.join(process.env.HOME, 'Library', 'R') : '',
].filter(p => p !== '');

const LINUX_R_PATHS = [
    '/usr/lib/R',
    '/usr/lib64/R',
    '/usr/local/lib/R',
    '/opt/R',
    '/usr/share/R',
    process.env.HOME ? path.join(process.env.HOME, '.local', 'lib', 'R') : '',
    process.env.HOME ? path.join(process.env.HOME, 'R') : '',
].filter(p => p !== '');

// R script to get installed packages info
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

/**
 * Get platform-specific R installation paths
 */
function getPlatformRPaths(): string[] {
    switch (PLATFORM) {
        case 'win32':
            return WINDOWS_R_PATHS;
        case 'darwin':
            return MACOS_R_PATHS;
        case 'linux':
            return LINUX_R_PATHS;
        default:
            return [];
    }
}

/**
 * Get the Rscript executable name for the current platform
 */
function getRscriptExecutableName(): string {
    return PLATFORM === 'win32' ? 'Rscript.exe' : 'Rscript';
}

/**
 * Search for Rscript in a macOS R.framework directory
 */
function findRscriptInFramework(basePath: string): string | null {
    if (!fs.existsSync(basePath)) return null;

    try {
        const versions = fs.readdirSync(basePath)
            .filter(dir => /^\d+\.\d+/.test(dir) || dir === 'Current')
            .sort(sortDescending);

        for (const version of versions) {
            const rscriptPath = path.join(basePath, version, 'Resources', 'bin', 'Rscript');
            if (fs.existsSync(rscriptPath)) {
                return rscriptPath;
            }
        }
    } catch {
        // Intentionally ignore filesystem errors (e.g., permission denied)
        // Return null to indicate path not found in this location
    }
    return null;
}

/**
 * Search for Rscript in a Homebrew Cellar directory
 */
function findRscriptInHomebrew(basePath: string): string | null {
    if (!fs.existsSync(basePath)) return null;

    try {
        const versions = fs.readdirSync(basePath)
            .sort(sortDescending);

        for (const version of versions) {
            const rscriptPath = path.join(basePath, version, 'bin', 'Rscript');
            if (fs.existsSync(rscriptPath)) {
                return rscriptPath;
            }
        }
    } catch {
        // Intentionally ignore directory read errors
        // Return null to continue searching other locations
    }
    return null;
}

/**
 * Search for Rscript in a standard Linux/Unix directory
 */
function findRscriptInStandardDir(basePath: string): string | null {
    if (!fs.existsSync(basePath)) return null;

    // Check direct bin path
    const directPath = path.join(basePath, 'bin', 'Rscript');
    if (fs.existsSync(directPath)) {
        return directPath;
    }

    // Check versioned subdirectories (e.g., /opt/R/4.3.0/bin/Rscript)
    try {
        const versions = fs.readdirSync(basePath)
            .filter(dir => /^\d+\.\d+/.test(dir) || dir.startsWith('R-'))
            .sort(sortDescending);

        for (const version of versions) {
            const rscriptPath = path.join(basePath, version, 'bin', 'Rscript');
            if (fs.existsSync(rscriptPath)) {
                return rscriptPath;
            }
        }
    } catch {
        // Intentionally ignore directory traversal errors
        // Common causes: permission denied, broken symlinks
    }
    return null;
}

/**
 * Find Rscript executable path
 * Searches common installation directories based on the current platform
 */
async function findRscriptPath(): Promise<string> {
    // Return cached path if available
    if (cachedRscriptPath) {
        return cachedRscriptPath;
    }

    // First, try if Rscript is in PATH
    try {
        await execAsync('Rscript --version');
        cachedRscriptPath = 'Rscript';
        return cachedRscriptPath;
    } catch {
        // Not in PATH, search common locations
    }

    const platformPaths = getPlatformRPaths();
    const executableName = getRscriptExecutableName();

    for (const basePath of platformPaths) {
        if (!fs.existsSync(basePath)) continue;

        let foundPath: string | null = null;

        if (PLATFORM === 'win32') {
            // Windows: search for R-x.x.x directories
            try {
                const versions = fs.readdirSync(basePath)
                    .filter(dir => dir.startsWith('R-'))
                    .sort(sortDescending);

                for (const version of versions) {
                    const rscriptPath = path.join(basePath, version, 'bin', executableName);
                    if (fs.existsSync(rscriptPath)) {
                        foundPath = rscriptPath;
                        break;
                    }
                }
            } catch {
                // Failed to read directory, continue to next path
                continue;
            }
        } else if (PLATFORM === 'darwin') {
            // macOS: handle different installation methods
            if (basePath.includes('R.framework')) {
                foundPath = findRscriptInFramework(basePath);
            } else if (basePath.includes('Cellar')) {
                foundPath = findRscriptInHomebrew(basePath);
            } else {
                foundPath = findRscriptInStandardDir(basePath);
            }
        } else {
            // Linux: check standard directories
            foundPath = findRscriptInStandardDir(basePath);
        }

        if (foundPath) {
            // Verify it works
            try {
                await execAsync(`"${foundPath}" --version`);
                cachedRscriptPath = foundPath;
                return cachedRscriptPath;
            } catch {
                // Rscript found but verification failed, try next location
                continue;
            }
        }
    }

    throw new RNotFoundError();
}

/**
 * Execute R script code using a temporary file
 * This avoids shell escaping issues on Windows
 */
async function execRscriptCode(code: string): Promise<{ stdout: string; stderr: string }> {
    const rscriptPath = await findRscriptPath();
    const os = await import('os');
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `${TEMP_SCRIPT_PREFIX}${Date.now()}${TEMP_SCRIPT_EXTENSION}`);

    try {
        // Write R script to temp file
        fs.writeFileSync(tempFile, code, 'utf8');

        // Execute the script file
        const command = rscriptPath === 'Rscript'
            ? `Rscript "${tempFile}"`
            : `"${rscriptPath}" "${tempFile}"`;

        const result = await execAsync(command);
        return result;
    } finally {
        // Clean up temp file - ignore errors as cleanup is best-effort
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch {
            // Intentionally ignore cleanup errors - temp files will be cleaned by OS
        }
    }
}

/**
 * Scan for installed R libraries
 */
export async function scanLibraries(options: LibraryScanOptions): Promise<LibraryScanResult> {
    // First, verify R is available (this also caches the path)
    await findRscriptPath();

    // Get R environment info
    const rInfo = await getRInfo();

    // Get installed packages
    const libraries = await getInstalledPackages(options);

    return createLibraryScanResult({
        rVersion: rInfo.version,
        rHome: rInfo.rHome,
        libraryPaths: rInfo.libPaths,
        libraries,
    });
}

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

            // Skip base packages if not requested
            if (!options.includeBase && isBase) {
                continue;
            }

            // Apply filter if provided
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

        // Sort libraries
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
