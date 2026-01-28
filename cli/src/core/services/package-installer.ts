/**
 * Service: Package Installer
 *
 * Handles R package installation logic and validation.
 */

import { RBridge } from './r-bridge';
import {
    InstallationRequest,
    InstallationResponse,
    PackageInfo,
} from '../../shared/types/installation';
import { ExecutionResponse } from '../../shared/types/execution';

export class PackageInstaller {
    private bridge: RBridge;

    constructor(timeout?: number) {
        this.bridge = new RBridge(timeout);
    }

    /**
     * Check if packages are already installed
     */
    async checkPackages(packages: string[]): Promise<PackageInfo[]> {
        const code = `
packages <- c(${packages.map((p) => `"${p}"`).join(', ')})
installed <- installed.packages()[, "Package"]

result <- lapply(packages, function(pkg) {
    is_installed <- pkg %in% installed
    version <- if (is_installed) as.character(packageVersion(pkg)) else NA
    list(
        name = pkg,
        installed = is_installed,
        version = version
    )
})

cat(jsonlite::toJSON(result, auto_unbox = TRUE))
        `;

        const response = await this.bridge.runCode(code);

        if (response.status === 'completed' && response.output) {
            try {
                // Strategy 1: Try to find JSON array starting with [{
                const jsonArrayMatch = response.output.match(/\[\s*\{[\s\S]*\}\s*\]/);
                if (jsonArrayMatch) {
                    return JSON.parse(jsonArrayMatch[0]);
                }

                // Strategy 2: Try to find any JSON array
                const anyArrayMatch = response.output.match(/\[[\s\S]*?\]/);
                if (anyArrayMatch) {
                    try {
                        return JSON.parse(anyArrayMatch[0]);
                    } catch {
                        // Continue to next strategy
                    }
                }

                // Strategy 3: Try parsing the whole output
                return JSON.parse(response.output.trim());
            } catch (error: any) {
                // Provide detailed error for debugging
                const preview = response.output.substring(0, 100);
                throw new Error(
                    `Failed to parse package status. Output preview: "${preview}...". Error: ${error.message}`
                );
            }
        }

        throw new Error('Failed to check package status');
    }

    /**
     * Install packages
     */
    async install(
        request: InstallationRequest
    ): Promise<InstallationResponse> {
        const execResponse = await this.bridge.installPackages(
            request.packages,
            {
                repos: request.repos,
                dependencies: request.dependencies,
                source: request.source,
            }
        );

        // Convert ExecutionResponse to InstallationResponse
        return this.convertResponse(execResponse, request.packages);
    }

    /**
     * Check if listener is running
     */
    isListenerRunning(): boolean {
        return this.bridge.isListenerRunning();
    }

    // ============================================
    // Private Methods
    // ============================================

    /**
     * Convert ExecutionResponse to InstallationResponse
     */
    private convertResponse(
        execResponse: ExecutionResponse,
        requestedPackages: string[]
    ): InstallationResponse {
        const response: InstallationResponse = {
            id: execResponse.id,
            status: this.mapStatus(execResponse.status),
            output: execResponse.output,
            error: execResponse.error,
            duration: execResponse.duration,
        };

        // Try to parse installation results from output
        if (execResponse.status === 'completed') {
            response.installed = requestedPackages;
            response.failed = [];
        } else if (execResponse.status === 'error') {
            response.installed = [];
            response.failed = requestedPackages;
        } else {
            // Partial success - try to determine which packages succeeded
            response.installed = [];
            response.failed = requestedPackages;
            response.status = 'partial';
        }

        return response;
    }

    /**
     * Map ExecutionStatus to InstallationStatus
     */
    private mapStatus(
        execStatus: string
    ): InstallationResponse['status'] {
        switch (execStatus) {
            case 'pending':
                return 'pending';
            case 'running':
                return 'installing';
            case 'completed':
                return 'completed';
            case 'error':
                return 'error';
            case 'rejected':
                return 'rejected';
            case 'timeout':
                return 'timeout';
            default:
                return 'error';
        }
    }
}
