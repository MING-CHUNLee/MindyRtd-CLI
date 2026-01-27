/**
 * Type definitions for R Library information
 * 
 * Defines the data structures for installed R packages/libraries.
 */

/**
 * Information about a single R library/package
 */
export interface LibraryInfo {
    /** Package name */
    name: string;
    /** Package version */
    version: string;
    /** Package title/description */
    title?: string;
    /** Installation path */
    libraryPath: string;
    /** Whether the package is from base R */
    isBase: boolean;
    /** Package priority (base, recommended, etc.) */
    priority?: string;
}

/**
 * Result of scanning R libraries
 */
export interface LibraryScanResult {
    /** When the scan was performed */
    scannedAt: Date;
    /** R version detected */
    rVersion: string;
    /** Path to R installation */
    rHome: string;
    /** List of library paths searched */
    libraryPaths: string[];
    /** All installed libraries */
    libraries: LibraryInfo[];
    /** Total number of libraries */
    totalLibraries: number;
    /** Number of base packages */
    basePackages: number;
    /** Number of user-installed packages */
    userPackages: number;
}

/**
 * Options for library scanning
 */
export interface LibraryScanOptions {
    /** Include base R packages */
    includeBase: boolean;
    /** Filter by package name pattern */
    filter?: string;
    /** Sort order */
    sortBy: 'name' | 'version';
}

/**
 * Factory function to create LibraryInfo
 */
export function createLibraryInfo(props: {
    name: string;
    version: string;
    title?: string;
    libraryPath: string;
    isBase?: boolean;
    priority?: string;
}): LibraryInfo {
    return {
        name: props.name,
        version: props.version,
        title: props.title,
        libraryPath: props.libraryPath,
        isBase: props.isBase ?? false,
        priority: props.priority,
    };
}

/**
 * Factory function to create LibraryScanResult
 */
export function createLibraryScanResult(props: {
    rVersion: string;
    rHome: string;
    libraryPaths: string[];
    libraries: LibraryInfo[];
}): LibraryScanResult {
    const basePackages = props.libraries.filter(lib => lib.isBase).length;
    const userPackages = props.libraries.filter(lib => !lib.isBase).length;

    return {
        scannedAt: new Date(),
        rVersion: props.rVersion,
        rHome: props.rHome,
        libraryPaths: props.libraryPaths,
        libraries: props.libraries,
        totalLibraries: props.libraries.length,
        basePackages,
        userPackages,
    };
}
