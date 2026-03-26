/**
 * Domain Interface: IDirectoryScanner
 *
 * Contract for scanning a directory tree and returning structured file metadata.
 * Tools depend on this interface; the infrastructure layer provides the concrete
 * implementation (DirectoryScanner wrapping the filesystem scanDirectory function).
 */

import { ScanOptions, ScanResult } from '../../shared/types';

export interface IDirectoryScanner {
    scan(options: ScanOptions): Promise<ScanResult>;
}
