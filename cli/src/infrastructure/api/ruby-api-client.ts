/**
 * Gateway: Ruby Backend API Client
 *
 * Handles HTTP communication with the Ruby backend API.
 * The Ruby API is responsible for calling the LLM (Claude) and
 * returning the processed result.
 *
 * Expected Ruby API endpoints:
 *
 *   POST /resolve
 *   Body:     { instruction, files: [{ path, preview }] }
 *   Response: { target_files: string[] }
 *
 *   POST /edit
 *   Body:     { file_path, content, instruction }
 *   Response: { modified_content }
 */

import axios, { AxiosError } from 'axios';
import { getEnv } from '../config';
import { RUBY_API } from '../config/constants';

// ============================================
// Types
// ============================================

// ---- Resolve ----

/** One file entry sent to the LLM for relevance scoring */
export interface FilePreview {
    /** Relative path shown to the LLM (e.g. "src/load_data.R") */
    path: string;
    /** First ~10 lines — enough for the LLM to judge relevance */
    preview: string;
}

export interface ResolveFilesRequest {
    instruction: string;
    files: FilePreview[];
}

export interface ResolveFilesResponse {
    /** Paths the LLM decided are relevant to the instruction */
    targetFiles: string[];
}

// ---- Edit ----

export interface EditFileRequest {
    filePath: string;
    content: string;
    instruction: string;
}

export interface EditFileResponse {
    modifiedContent: string;
}

// ============================================
// Ruby API Client
// ============================================

export class RubyApiClient {
    private baseUrl: string;
    private timeout: number;

    constructor() {
        const host = getEnv('API_HOST') ?? RUBY_API.DEFAULT_HOST;
        const port = getEnv('API_PORT') ?? String(RUBY_API.DEFAULT_PORT);
        this.baseUrl = `http://${host}:${port}`;
        this.timeout = RUBY_API.DEFAULT_TIMEOUT_MS;
    }

    /**
     * Phase 1 — Resolve
     * Send the instruction + file metadata to the LLM.
     * The LLM decides which files are actually relevant and returns their paths.
     */
    async resolveFiles(request: ResolveFilesRequest): Promise<ResolveFilesResponse> {
        try {
            const response = await axios.post<{ target_files: string[] }>(
                `${this.baseUrl}/resolve`,
                {
                    instruction: request.instruction,
                    files: request.files,
                },
                { timeout: this.timeout }
            );

            return { targetFiles: response.data.target_files };
        } catch (error) {
            this.handleAxiosError(error, 'resolve');
        }
    }

    /**
     * Phase 2 — Edit
     * Send a file's content and an instruction to the Ruby API.
     * The Ruby API calls the LLM and returns the modified content.
     */
    async editFile(request: EditFileRequest): Promise<EditFileResponse> {
        try {
            const response = await axios.post<{ modified_content: string }>(
                `${this.baseUrl}/edit`,
                {
                    file_path: request.filePath,
                    content: request.content,
                    instruction: request.instruction,
                },
                { timeout: this.timeout }
            );

            return { modifiedContent: response.data.modified_content };
        } catch (error) {
            this.handleAxiosError(error, 'edit');
        }
    }

    // ============================================
    // Helpers
    // ============================================

    private handleAxiosError(error: unknown, endpoint: string): never {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNREFUSED') {
            throw new Error(
                `Cannot connect to Ruby API at ${this.baseUrl}. ` +
                `Make sure the API server is running (rake run).`
            );
        }
        if (axiosError.response) {
            throw new Error(
                `Ruby API /${endpoint} error ${axiosError.response.status}: ` +
                JSON.stringify(axiosError.response.data)
            );
        }
        throw error;
    }
}
