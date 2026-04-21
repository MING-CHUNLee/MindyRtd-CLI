import { IDirectoryScanner } from '../../domain/types/directory-scanner';
import { ScanOptions, ScanResult } from '../../shared/types';
import { scanDirectory } from './file-scanner';

export class DirectoryScanner implements IDirectoryScanner {
    scan(options: ScanOptions): Promise<ScanResult> {
        return scanDirectory(options);
    }
}
