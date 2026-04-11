/**
 * Environment context — combines R environment and file information
 */

import { LibraryScanResult } from './library-info';
import { ScanResult } from './scan-result';

/**
 * Complete environment context combining R environment and file information
 */
export interface EnvironmentContext {
    /** R environment information */
    rEnvironment: LibraryScanResult;
    /** File scan results */
    fileContext: ScanResult;
    /** Current working directory */
    workingDirectory: string;
    /** Timestamp of context generation */
    generatedAt: Date;
}
