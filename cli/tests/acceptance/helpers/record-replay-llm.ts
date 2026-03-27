/**
 * RecordReplayLLM
 *
 * A deterministic LLM stub for BDD acceptance tests.  Supports three modes:
 *
 * 1. Inline replay (default)
 *    new RecordReplayLLM([...cassettes])
 *    Cassette entries are consumed in FIFO order.  No API key required.
 *
 * 2. Record mode
 *    RecordReplayLLM.createRecorder(LLMController.fromEnv())
 *    Delegates every call to the real LLM and captures the response.
 *    Call llm.saveToFile(path) after the test to persist the cassettes.
 *    Requires a valid API key in the environment (see .env.example).
 *
 * 3. Replay-from-file mode
 *    RecordReplayLLM.fromFile('./tests/acceptance/fixtures/my.cassettes.json')
 *    Loads cassettes from a JSON file previously saved by record mode.
 *
 * stream: true  → content is split into ~20-char chunks and delivered via onToken callback.
 * stream: false → onToken is called once with the full content (default for sendPrompt).
 */

import fs from 'fs';
import path from 'path';
import type { LLMRequestPayload, LLMResponse } from '../../../src/shared/types/llm-types';

/**
 * Minimal interface required for recording.
 * Structurally matches LLMController — no class import needed.
 */
export interface ILLMForRecording {
    sendPrompt(request: LLMRequestPayload): Promise<LLMResponse>;
    streamPrompt(request: LLMRequestPayload, onToken: (token: string) => void): Promise<LLMResponse>;
    getProviderInfo(): { provider: string; model: string; endpoint: string };
}

export interface CassetteEntry {
    response: LLMResponse;
    /** If true, content is chunked via onToken in streamPrompt (ignored for sendPrompt). */
    stream?: boolean;
}

export class RecordReplayLLM {
    private readonly queue: CassetteEntry[];
    private idx = 0;

    // Record-mode state
    private readonly realLLM?: ILLMForRecording;
    private readonly recorded: CassetteEntry[] = [];

    constructor(cassettes: CassetteEntry[], realLLM?: ILLMForRecording) {
        this.queue = cassettes;
        this.realLLM = realLLM;
    }

    // ── Factory methods ────────────────────────────────────────────────────────

    /**
     * Record mode: wrap a real LLMController and capture every response.
     * Call saveToFile(path) after the test to persist the cassettes.
     */
    static createRecorder(realLLM: ILLMForRecording): RecordReplayLLM {
        return new RecordReplayLLM([], realLLM);
    }

    /**
     * Replay-from-file mode: load cassettes from a JSON fixture file.
     */
    static fromFile(fixturePath: string): RecordReplayLLM {
        const abs = path.resolve(fixturePath);
        const cassettes = JSON.parse(fs.readFileSync(abs, 'utf-8')) as CassetteEntry[];
        return new RecordReplayLLM(cassettes);
    }

    // ── Recording helpers ──────────────────────────────────────────────────────

    /** Whether this instance is in record mode (wrapping a real LLM). */
    get isRecordMode(): boolean {
        return this.realLLM !== undefined;
    }

    /** Returns all cassettes captured in record mode. */
    dump(): CassetteEntry[] {
        return [...this.recorded];
    }

    /**
     * Save all recorded cassettes to a JSON fixture file.
     * Only valid after createRecorder(); safe to call in replay mode (no-op).
     */
    saveToFile(fixturePath: string): void {
        const abs = path.resolve(fixturePath);
        try {
            fs.mkdirSync(path.dirname(abs), { recursive: true });
        } catch (err) {
            // Bun on Windows throws EEXIST from mkdirSync({ recursive: true })
            // even when the directory already exists — same workaround as paths.ts.
            if ((err as { code?: string }).code !== 'EEXIST') throw err;
        }
        fs.writeFileSync(abs, JSON.stringify(this.recorded, null, 2), 'utf-8');
    }

    // ── LLMController interface ────────────────────────────────────────────────

    async sendPrompt(request: LLMRequestPayload): Promise<LLMResponse> {
        if (this.realLLM) {
            const response = await this.realLLM.sendPrompt(request);
            this.recorded.push({ response });
            return response;
        }
        return this.next();
    }

    async streamPrompt(
        request: LLMRequestPayload,
        onToken: (token: string) => void,
    ): Promise<LLMResponse> {
        if (this.realLLM) {
            // Real LLM streams tokens itself; we capture the final response.
            const response = await this.realLLM.streamPrompt(request, onToken);
            this.recorded.push({ response, stream: true });
            return response;
        }
        // Replay mode: chunk content to simulate streaming
        const entry = this.next();
        const CHUNK = 20;
        const content = entry.content;
        for (let i = 0; i < content.length; i += CHUNK) {
            onToken(content.slice(i, i + CHUNK));
        }
        return entry;
    }

    getProviderInfo(): { provider: string; model: string; endpoint: string } {
        if (this.realLLM) return this.realLLM.getProviderInfo();
        return { provider: 'test', model: 'test-model', endpoint: 'http://localhost' };
    }

    // ── Queue state ────────────────────────────────────────────────────────────

    /** How many cassette entries have been consumed (replay mode only). */
    get consumed(): number { return this.idx; }

    /**
     * How many entries remain in the queue.
     * Always 0 in record mode (no queue) — skip this assertion when recording.
     */
    get remaining(): number { return this.queue.length - this.idx; }

    private next(): LLMResponse {
        if (this.idx >= this.queue.length) {
            throw new Error(
                `RecordReplayLLM: cassette exhausted at index ${this.idx} ` +
                `(total ${this.queue.length} entries). ` +
                `An unexpected LLM call was made — add more cassette entries.`,
            );
        }
        return this.queue[this.idx++].response;
    }
}
