/**
 * Service: Orchestrator
 *
 * Drives the ReAct loop for a single instruction.
 *
 * Simple mode (default):
 *   Runs one ReActLoop.run() and extracts artifacts from the result.
 *
 * Multi-step mode (instruction contains "then|also|first|each"):
 *   1. Asks the LLM to decompose instruction → sub-task strings
 *   2. Runs one ReActLoop per sub-task
 *   3. Merges all artifacts and usage
 *
 * Token budget (default 100 000 tokens):
 *   Stops processing sub-tasks once the cumulative input tokens exceed the budget.
 *
 * Artifact extraction:
 *   If the result contains a JSON array matching [{"path":"...","content":"..."}],
 *   those are extracted as edit artifacts. Otherwise the result is a text artifact.
 */

import { LLMController } from '../../infrastructure/api/llm-controller';
import { LLMRequestPayload } from '../../shared/types/llm-types';
import { TurnUsage } from '../../domain/entities/conversation-turn';
import { FileChange } from '../../domain/entities/file-change';
import { LLMOutput } from '../../domain/entities/llm-output';
import { ToolRegistry } from './tool-registry';
import { ReActLoop, ReActResult, ReActStep } from './react-loop';
import { extractJsonArray } from '../../shared/utils/json-extractor';
import { DECOMPOSER_SYSTEM_PROMPT } from '../prompts/decomposer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestratorResult {
    fileChanges: FileChange[];
    outputs: LLMOutput[];
    steps: ReActStep[];
    usage: TurnUsage;
    /** Number of sub-tasks run (1 for simple mode) */
    subTasksRun: number;
}

// Keywords that trigger multi-step decomposition
const MULTI_STEP_PATTERN = /\bthen\b|\balso\b|\bfirst\b|\beach\b/i;

// Default token budget for the entire orchestrator run
const DEFAULT_TOKEN_BUDGET = 100_000;

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class Orchestrator {
    private readonly reactLoop: ReActLoop;

    constructor(
        private readonly llm: LLMController,
        private readonly registry: ToolRegistry,
        private readonly tokenBudget = DEFAULT_TOKEN_BUDGET,
        reactLoop?: ReActLoop,
    ) {
        this.reactLoop = reactLoop ?? new ReActLoop(llm, registry);
    }

    async run(
        baseRequest: LLMRequestPayload,
        instruction: string,
    ): Promise<OrchestratorResult> {
        const isMultiStep = MULTI_STEP_PATTERN.test(instruction);

        if (isMultiStep) {
            return this.runMultiStep(baseRequest, instruction);
        }
        return this.runSimple(baseRequest);
    }

    // ── Simple mode ───────────────────────────────────────────────────────

    private async runSimple(baseRequest: LLMRequestPayload): Promise<OrchestratorResult> {
        const loopResult = await this.reactLoop.run(baseRequest);
        const { fileChanges, outputs } = extractResults(loopResult.result);
        return {
            fileChanges,
            outputs,
            steps: loopResult.steps,
            usage: loopResult.usage,
            subTasksRun: 1,
        };
    }

    // ── Multi-step mode ───────────────────────────────────────────────────

    private async runMultiStep(
        baseRequest: LLMRequestPayload,
        instruction: string,
    ): Promise<OrchestratorResult> {
        const subTasks = await this.decompose(baseRequest, instruction);

        const allFileChanges: FileChange[] = [];
        const allOutputs: LLMOutput[] = [];
        const allSteps: ReActStep[] = [];
        const cumUsage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
        let subTasksRun = 0;

        for (const subTask of subTasks) {
            if (cumUsage.inputTokens >= this.tokenBudget) break;

            const subRequest: LLMRequestPayload = {
                ...baseRequest,
                userMessage: subTask,
            };

            const loopResult = await this.reactLoop.run(subRequest);
            subTasksRun++;

            const { fileChanges, outputs } = extractResults(loopResult.result);
            allFileChanges.push(...fileChanges);
            allOutputs.push(...outputs);
            allSteps.push(...loopResult.steps);
            cumUsage.inputTokens += loopResult.usage.inputTokens;
            cumUsage.outputTokens += loopResult.usage.outputTokens;
            cumUsage.cacheCreationTokens += loopResult.usage.cacheCreationTokens;
            cumUsage.cacheReadTokens += loopResult.usage.cacheReadTokens;
        }

        return {
            fileChanges: allFileChanges,
            outputs: allOutputs,
            steps: allSteps,
            usage: cumUsage,
            subTasksRun,
        };
    }

    // ── Decompose helper ──────────────────────────────────────────────────

    private async decompose(
        baseRequest: LLMRequestPayload,
        instruction: string,
    ): Promise<string[]> {
        try {
            const response = await this.llm.sendPrompt({
                systemPrompt: DECOMPOSER_SYSTEM_PROMPT,
                userMessage: `Decompose this instruction into sub-tasks:\n${instruction}`,
                history: baseRequest.history,
            });
            const jsonStr = extractJsonArray(response.content);
            if (jsonStr) {
                const tasks = JSON.parse(jsonStr) as string[];
                if (Array.isArray(tasks) && tasks.length > 0) return tasks;
            }
        } catch {
            // Fallback: treat as single task
        }
        return [instruction];
    }
}

// ── Result extraction ─────────────────────────────────────────────────────────

/**
 * Attempt to parse the result as a JSON edit array: [{"path":"...","content":"..."}].
 * If that succeeds, return FileChange[]. Otherwise wrap it as a single LLMOutput.
 */
function extractResults(result: string): { fileChanges: FileChange[]; outputs: LLMOutput[] } {
    const jsonStr = extractJsonArray(result);
    if (jsonStr) {
        try {
            const parsed = JSON.parse(jsonStr) as Array<{ path?: string; content?: string }>;
            if (
                Array.isArray(parsed) &&
                parsed.length > 0 &&
                parsed.every(item => typeof item.path === 'string' && typeof item.content === 'string')
            ) {
                return {
                    fileChanges: parsed.map(item => FileChange.create('edit', item.path!, item.content!)),
                    outputs: [],
                };
            }
        } catch {
            // Not valid edit JSON — fall through
        }
    }
    return { fileChanges: [], outputs: [LLMOutput.create('analysis', result)] };
}
