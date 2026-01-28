/**
 * Scan result type
 */

import { FileInfo } from './file-info';
import { ProjectInfo } from './project-info';

export interface RFileCollection {
    rScripts: FileInfo[];
    rMarkdown: FileInfo[];
    rData: FileInfo[];
    rProject: FileInfo[];
    dataFiles: FileInfo[];
    documents: FileInfo[];
}

export interface ScanResult {
    scannedAt: Date;
    baseDirectory: string;
    projectInfo: ProjectInfo | null;
    files: RFileCollection;
    totalFiles: number;
}

export interface ScanResultProps {
    scannedAt?: Date;
    baseDirectory: string;
    projectInfo: ProjectInfo | null;
    files: RFileCollection;
}

export function createScanResult(props: ScanResultProps): ScanResult {
    const totalFiles =
        props.files.rScripts.length +
        props.files.rMarkdown.length +
        props.files.rData.length +
        props.files.rProject.length +
        props.files.dataFiles.length +
        props.files.documents.length;

    const result: ScanResult = {
        scannedAt: props.scannedAt || new Date(),
        baseDirectory: props.baseDirectory,
        projectInfo: props.projectInfo,
        files: props.files,
        totalFiles,
    };

    return Object.freeze(result);
}
