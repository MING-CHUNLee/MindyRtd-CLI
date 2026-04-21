/**
 * Service: IntentRouter
 *
 * Classifies a user instruction into one of four intents:
 *   'ask' | 'edit' | 'run' | 'install'
 *
 * Algorithm:
 *   1. Fast deterministic regex pre-check (no LLM call).
 *   2. LLM classification for ambiguous cases using INTENT_CLASSIFIER_SYSTEM_PROMPT.
 *
 * Extracted from AgentService to keep that class focused on session lifecycle
 * and use-case orchestration.
 */

import { LLMGateway } from '../../domain/types/llm-gateway';
import { INTENT_CLASSIFIER_SYSTEM_PROMPT } from '../prompts/intent-classifier';
import { SessionMessage } from '../../shared/types/messages';

export type Intent = 'ask' | 'edit' | 'run' | 'install';

type EmitFn = (type: string, data: Record<string, unknown>) => void;

export class IntentRouter {
    constructor(
        private readonly llm: LLMGateway,
        private readonly emit: EmitFn,
    ) {}

    async classify(instruction: string, history: SessionMessage[]): Promise<Intent> {
        this.emit('phase_start', { phase: 'intent', description: 'Classifying intent' });

        // ── Regex pre-check (deterministic, no LLM call needed) ──────────────
        const definiteIntent = IntentRouter.detectObviousIntent(instruction);
        if (definiteIntent) {
            this.emit('intent_classified', { intent: definiteIntent });
            this.emit('phase_end', { phase: 'intent', success: true });
            return definiteIntent;
        }

        // ── LLM classification for ambiguous cases ────────────────────────────
        let intent: Intent = 'ask';
        try {
            const intentResponse = await this.llm.sendPrompt({
                systemPrompt: INTENT_CLASSIFIER_SYSTEM_PROMPT,
                userMessage: instruction,
                history,
            });
            const response = intentResponse.content.trim().toLowerCase();
            if (response.includes('install')) intent = 'install';
            else if (response.includes('run')) intent = 'run';
            else if (response.includes('edit')) intent = 'edit';
            // else: 'ask' (default — also covers LLM returning "ask" or anything unexpected)
        } catch (error) {
            this.emit('status_update', {
                warning: `Intent classification failed: ${error instanceof Error ? error.message : String(error)}, defaulting to ask`,
            });
        }

        this.emit('intent_classified', { intent });
        this.emit('phase_end', { phase: 'intent', success: true });
        return intent;
    }

    /**
     * Deterministic intent detection for unambiguous instructions.
     * Returns null if the instruction is ambiguous and needs LLM classification.
     */
    static detectObviousIntent(instruction: string): Intent | null {
        const lower = instruction.toLowerCase();

        // ask: ends with "?" or starts with a question word / conversational phrase
        if (instruction.trim().endsWith('?')) return 'ask';
        if (/^(?:what|how|why|when|where|who|can|could|is|are|does|did|have|has|tell me|explain|show me|describe|what'?s|幫我解釋|解釋|說明|告訴我|上次|我們上次)\b/i.test(lower)) return 'ask';

        // install: "install X" / "安裝 X" where X looks like a package name
        if (/(?:install|安裝)\s+[A-Za-z0-9._]/.test(instruction)) return 'install';

        // run: explicit execute/run/render keyword + R/Rmd file reference or path
        const hasRunKeyword = /\b(?:execute|run|render|執行|跑|knit)\b/i.test(lower);
        const hasRFile = /\.(?:r|rmd)\b/i.test(instruction);
        if (hasRunKeyword && hasRFile) return 'run';

        // run: bare path to an R/Rmd file (e.g. "C:/foo/bar.Rmd")
        if (/[A-Za-z]:[/\\][^\s]+\.(?:Rmd|rmd|R)\b/.test(instruction)) return 'run';
        if (/\/[^\s]+\.(?:Rmd|rmd|R)\b/.test(instruction)) return 'run';

        return null;
    }
}
