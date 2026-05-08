import { LLMGateway } from '../../domain/types/llm-gateway';
import { GuardResult, IGuardAgent } from '../../domain/types/guard-agent';
import type { TutorStyle } from '../use-cases/execute-tutor-use-case';
import {
    buildJudgeSystemPrompt,
    buildRefusalInstruction,
    NON_ENGLISH_REFUSAL,
} from '../prompts/guard-agent';

// ── Phase 0: Language check ───────────────────────────────────────────────────
// Matches CJK, Arabic, Cyrillic, Devanagari, Thai, Hebrew, and other non-Latin ranges.
const NON_ENGLISH_RE = /[-￿]/;

function isNonEnglish(prompt: string): boolean {
    return NON_ENGLISH_RE.test(prompt);
}

// ── Phase 1: Rule-based jailbreak patterns (English only) ─────────────────────
const JAILBREAK_PATTERNS: RegExp[] = [
    // Instruction override
    /ignore\s+(all\s+)?(your\s+|previous\s+)?instructions?/i,
    /forget\s+(you\s+are|your\s+role|all\s+|previous)/i,
    /forget\s+everything/i,
    /disregard\s+(all\s+|your\s+)?instructions?/i,

    // Role hijack
    /I\s+am\s+(the\s+|your\s+)?(teacher|instructor|professor|admin)/i,
    /pretend\s+you\s+(are|were).{0,30}(teacher|grader|evaluator)/i,
    /act\s+as\s+(a\s+)?(teacher|grader|answer\s+key)/i,
    /I('m|\s+am)\s+testing\s+the\s+system/i,

    // Developer / debug mode
    /developer\s+mode/i,
    /you\s+are\s+(now\s+)?(a\s+)?debugging\s+tool/i,
    /debug\s+mode/i,

    // System prompt extraction
    /system\s+prompt/i,
    /hidden\s+solution/i,
    /show\s+(me\s+)?your\s+(instructions?|prompt|rules?)/i,
    /print\s+(the\s+)?(original\s+)?(prompt|instructions?)/i,
    /reference\s+answer/i,
    /answer\s+key/i,

    // Direct answer demand
    /just\s+(give|tell|show|output)\s+me\s+the\s+(correct\s+)?answer/i,
    /only\s+output\s+(the\s+)?(final\s+)?result/i,
    /no\s+explanation.{0,20}(just|only)\s+(give|show|output)/i,
    /skip\s+the\s+explanation/i,

    // Indirect extraction via encoding / translation
    /translate\s+the\s+(correct\s+)?answer\s+to/i,
    /encode\s+(the\s+)?(answer|solution)\s+(in|as|to)\s+base64/i,
    /write\s+the\s+answer\s+as\s+a\s+(poem|song|haiku)/i,
];

// ── GuardAgent ────────────────────────────────────────────────────────────────

export class GuardAgent implements IGuardAgent {
    constructor(private readonly llm: LLMGateway) {}

    async check(userPrompt: string, policyText: string, style: TutorStyle): Promise<GuardResult> {
        // Phase 0: language check
        if (isNonEnglish(userPrompt)) {
            return {
                allowed: false,
                reason: 'non-English input',
                refusalInstruction: NON_ENGLISH_REFUSAL,
            };
        }

        // Phase 1: rule-based check
        const ruleResult = this.runRules(userPrompt, style);
        if (!ruleResult.allowed) return ruleResult;

        // Phase 2: LLM judge for ambiguous cases
        return this.runLLMJudge(userPrompt, policyText, style);
    }

    private runRules(prompt: string, style: TutorStyle): GuardResult {
        for (const pattern of JAILBREAK_PATTERNS) {
            if (pattern.test(prompt)) {
                const reason = `matched rule: ${pattern.source}`;
                return {
                    allowed: false,
                    reason,
                    refusalInstruction: buildRefusalInstruction(prompt, reason, style),
                };
            }
        }
        return { allowed: true, reason: 'passed rule checks' };
    }

    private async runLLMJudge(prompt: string, policyText: string, style: TutorStyle): Promise<GuardResult> {
        try {
            const response = await this.llm.sendPrompt({
                systemPrompt: buildJudgeSystemPrompt(policyText),
                userMessage: prompt,
            });

            const parsed = JSON.parse(response.content.trim()) as { allowed: boolean; reason: string };
            if (typeof parsed.allowed !== 'boolean' || typeof parsed.reason !== 'string') {
                throw new Error('unexpected JSON shape');
            }

            if (!parsed.allowed) {
                return {
                    allowed: false,
                    reason: parsed.reason,
                    refusalInstruction: buildRefusalInstruction(prompt, parsed.reason, style),
                };
            }
            return { allowed: true, reason: parsed.reason };
        } catch {
            // Degrade gracefully on malformed JSON or LLM failure — allow through
            return { allowed: true, reason: 'llm-judge unavailable, allowed by default' };
        }
    }
}
