/**
 * Service: R Script Runner
 *
 * Executes R scripts via temporary files using the Rscript binary.
 * Extracted from library-scanner.ts for single responsibility.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findRscriptPath } from './r-path-resolver';

const execAsync = promisify(exec);

const TEMP_SCRIPT_PREFIX = 'mindy_r_script_';
const TEMP_SCRIPT_EXTENSION = '.R';

/**
 * Execute R code by writing to a temp file and running with Rscript.
 * Cleans up the temp file after execution.
 *
 * @param rCode - The R code to execute
 * @returns The stdout and stderr output from the R script
 * @throws Error if R execution fails
 */
export async function execRscriptCode(rCode: string): Promise<{ stdout: string; stderr: string }> {
    const rscriptPath = await findRscriptPath();

    const tempFile = path.join(
        os.tmpdir(),
        `${TEMP_SCRIPT_PREFIX}${Date.now()}${TEMP_SCRIPT_EXTENSION}`
    );

    try {
        fs.writeFileSync(tempFile, rCode, 'utf-8');

        const command = rscriptPath === 'Rscript'
            ? `Rscript "${tempFile}"`
            : `"${rscriptPath}" "${tempFile}"`;

        return await execAsync(command);
    } finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempFile);
        } catch {
            // Intentionally ignore cleanup errors
        }
    }
}
