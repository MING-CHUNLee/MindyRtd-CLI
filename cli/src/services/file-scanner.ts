/**
 * Service: File Scanner
 * 
 * Scans directories for R-related files.
 * Currently runs locally. In the future, this may call the backend API instead.
 */

import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { FileInfo, ProjectInfo, ScanResult, ScanOptions } from '../types';
import { DirectoryNotFoundError, InvalidDirectoryError } from '../utils/errors';

// Pattern constants
const RECURSIVE_PATTERN = '**/*';
const TOP_LEVEL_PATTERN = '*';
const HIDDEN_FILE_PATTERNS = ['**/.*', '**/.*/**'];

/**
 * Scan a directory for R-related files
 */
export async function scanDirectory(options: ScanOptions): Promise<ScanResult> {
    const baseDir = path.resolve(options.targetDir);

    // Validate directory
    validateDirectory(baseDir);

    // Find all R files
    const files = await findAllRFiles(baseDir, options);

    // Detect project
    const projectInfo = detectProject(files.rProject, baseDir);

    // Calculate total
    const totalFiles =
        files.rScripts.length +
        files.rMarkdown.length +
        files.rData.length +
        files.rProject.length;

    return {
        scannedAt: new Date(),
        baseDirectory: baseDir,
        projectInfo,
        files,
        totalFiles,
    };
}

function validateDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        throw new DirectoryNotFoundError(dirPath);
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
        throw new InvalidDirectoryError(dirPath);
    }
}

async function findAllRFiles(baseDir: string, options: ScanOptions): Promise<{
    rScripts: FileInfo[];
    rMarkdown: FileInfo[];
    rData: FileInfo[];
    rProject: FileInfo[];
}> {
    const pattern = options.recursive ? RECURSIVE_PATTERN : TOP_LEVEL_PATTERN;
    const ignore = options.includeHidden ? [] : HIDDEN_FILE_PATTERNS;

    const searchOptions = {
        cwd: baseDir,
        absolute: true,
        nodir: true,
        ignore,
        nocase: true,
    };

    // Parallel search for all file types
    const [rScripts, rMarkdown, rData, rds, rProject] = await Promise.all([
        findFiles(`${pattern}.R`, searchOptions),
        findFiles(`${pattern}.Rmd`, searchOptions),
        findFiles(`${pattern}.RData`, searchOptions),
        findFiles(`${pattern}.rds`, searchOptions),
        findFiles(`${pattern}.Rproj`, searchOptions),
    ]);

    return {
        rScripts,
        rMarkdown,
        rData: [...rData, ...rds],
        rProject,
    };
}

async function findFiles(pattern: string, options: object): Promise<FileInfo[]> {
    try {
        const files = await glob(pattern, options);
        return files.map(getFileInfo);
    } catch {
        return [];
    }
}

function getFileInfo(filePath: string): FileInfo {
    const stats = fs.statSync(filePath);
    return {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        modifiedAt: stats.mtime,
        extension: path.extname(filePath).toLowerCase(),
    };
}

function detectProject(rprojFiles: FileInfo[], baseDir: string): ProjectInfo | null {
    if (rprojFiles.length > 0) {
        const rprojFile = rprojFiles[0];
        return {
            name: path.basename(rprojFile.name, '.Rproj'),
            path: rprojFile.path,
            type: 'rproj',
        };
    }

    // Infer from directory name
    const dirName = path.basename(baseDir);
    if (dirName) {
        return {
            name: dirName,
            path: baseDir,
            type: 'inferred',
        };
    }

    return null;
}
