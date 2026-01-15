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

// Cached Rscript path
let cachedRscriptPath: string | null = null;

// Common R installation paths on Windows
const WINDOWS_R_PATHS = [
    'C:\\Program Files\\R',
    'C:\\Program Files (x86)\\R',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'R') : '',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'R') : '',
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
 * Find Rscript executable path
 * Searches common installation directories on Windows
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

    // Search Windows R installation directories
    for (const basePath of WINDOWS_R_PATHS) {
        if (!fs.existsSync(basePath)) continue;

        try {
            // Get all R version directories and sort to get the latest
            const versions = fs.readdirSync(basePath)
                .filter(dir => dir.startsWith('R-'))
                .sort((a, b) => b.localeCompare(a)); // Sort descending to get latest version first

            for (const version of versions) {
                const rscriptPath = path.join(basePath, version, 'bin', 'Rscript.exe');
                if (fs.existsSync(rscriptPath)) {
                    // Verify it works
                    try {
                        await execAsync(`"${rscriptPath}" --version`);
                        cachedRscriptPath = rscriptPath;
                        return cachedRscriptPath;
                    } catch {
                        continue;
                    }
                }
            }
        } catch {
            continue;
        }
    }

    throw new RNotFoundError();
}

/**
 * Execute Rscript command with auto-detected path
 * Uses a temporary file to avoid shell escaping issues on Windows
 */
async function execRscript(args: string): Promise<{ stdout: string; stderr: string }> {
    const rscriptPath = await findRscriptPath();
    const command = rscriptPath === 'Rscript' ? `Rscript ${args}` : `"${rscriptPath}" ${args}`;
    return execAsync(command);
}

/**
 * Execute R script code using a temporary file
 * This avoids shell escaping issues on Windows
 */
async function execRscriptCode(code: string): Promise<{ stdout: string; stderr: string }> {
    const rscriptPath = await findRscriptPath();
    const os = await import('os');
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `mindy_r_script_${Date.now()}.R`);

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
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch {
            // Ignore cleanup errors
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
        return null;
    }
}
