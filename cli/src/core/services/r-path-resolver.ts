/**
 * Service: R Path Resolver
 *
 * Discovers R installation paths across platforms (Windows, macOS, Linux).
 * Extracted from library-scanner.ts for single responsibility.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { RNotFoundError } from '../../shared/utils/errors';

const execAsync = promisify(exec);

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

// ============================================
// Platform-Specific R Paths
// ============================================

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

// ============================================
// Platform Helpers
// ============================================

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

    const directPath = path.join(basePath, 'bin', 'Rscript');
    if (fs.existsSync(directPath)) {
        return directPath;
    }

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

// ============================================
// Public API
// ============================================

/**
 * Find Rscript executable path
 * Searches common installation directories based on the current platform
 */
export async function findRscriptPath(): Promise<string> {
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
                continue;
            }
        } else if (PLATFORM === 'darwin') {
            if (basePath.includes('R.framework')) {
                foundPath = findRscriptInFramework(basePath);
            } else if (basePath.includes('Cellar')) {
                foundPath = findRscriptInHomebrew(basePath);
            } else {
                foundPath = findRscriptInStandardDir(basePath);
            }
        } else {
            foundPath = findRscriptInStandardDir(basePath);
        }

        if (foundPath) {
            try {
                await execAsync(`"${foundPath}" --version`);
                cachedRscriptPath = foundPath;
                return cachedRscriptPath;
            } catch {
                continue;
            }
        }
    }

    throw new RNotFoundError();
}

/**
 * Clear the cached Rscript path (useful for testing)
 */
export function clearRscriptCache(): void {
    cachedRscriptPath = null;
}
