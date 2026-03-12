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
import { ToolRegistry } from './tool-registry';
import { ReActLoop, ReActResult, ReActStep } from './react-loop';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ArtifactKind = 'edit' | 'text';

export interface Artifact {
    kind: ArtifactKind;
    /** For 'text': the answer string. For 'edit': the file content. */
    content: string;
    /** Only present for 'edit' artifacts */
    path?: string;
}

export interface OrchestratorResult {
    artifacts: Artifact[];
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
    ) {
        this.reactLoop = new ReActLoop(llm, registry);
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
        return {
            artifacts: extractArtifacts(loopResult.result),
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

        const allArtifacts: Artifact[] = [];
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

            allArtifacts.push(...extractArtifacts(loopResult.result));
            allSteps.push(...loopResult.steps);
            cumUsage.inputTokens += loopResult.usage.inputTokens;
            cumUsage.outputTokens += loopResult.usage.outputTokens;
            cumUsage.cacheCreationTokens += loopResult.usage.cacheCreationTokens;
            cumUsage.cacheReadTokens += loopResult.usage.cacheReadTokens;
        }

        return {
            artifacts: allArtifacts,
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
                systemPrompt:
                    'You are a task decomposer. Given a complex instruction, split it into an ordered list of independent sub-tasks. ' +
                    'Return ONLY a JSON array of strings. No explanation.',
                userMessage: `Decompose this instruction into sub-tasks:\n${instruction}`,
                history: baseRequest.history,
            });
            const match = response.content.match(/\[[\s\S]*\]/);
            if (match) {
                const tasks = JSON.parse(match[0]) as string[];
                if (Array.isArray(tasks) && tasks.length > 0) return tasks;
            }
        } catch {
            // Fallback: treat as single task
        }
        return [instruction];
    }
}

// ── Artifact extraction ───────────────────────────────────────────────────────

/**
 * Attempt to parse the result as a JSON edit array: [{"path":"...","content":"..."}].
 * If that fails, wrap it as a single text artifact.
 */
function extractArtifacts(result: string): Artifact[] {
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
        try {
            const parsed = JSON.parse(match[0]) as Array<{ path?: string; content?: string }>;
            if (
                Array.isArray(parsed) &&
                parsed.length > 0 &&
                parsed.every(item => typeof item.path === 'string' && typeof item.content === 'string')
            ) {
                return parsed.map(item => ({
                    kind: 'edit' as ArtifactKind,
                    path: item.path!,
                    content: item.content!,
                }));
            }
        } catch {
            // Not valid edit JSON — fall through
        }
    }
    return [{ kind: 'text', content: result }];
}
