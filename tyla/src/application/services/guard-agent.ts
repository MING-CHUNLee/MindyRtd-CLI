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
    /write\s+(down\s+)?(the\s+|all\s+)?answers?/i,
    /(give|provide|output|list)\s+(me\s+)?(the\s+|all\s+)?(correct\s+)?answers?/i,
    /(do|complete|solve|finish)\s+(my|this|the)\s+(homework|assignment|exercises?|problems?|questions?)/i,
    /answer\s+(this|these|the\s+(question|problem|exercise|homework))/i,

    // Indirect extraction via encoding / translation
    /translate\s+the\s+(correct\s+)?answer\s+to/i,
    /encode\s+(the\s+)?(answer|solution)\s+(in|as|to)\s+base64/i,
    /write\s+the\s+answer\s+as\s+a\s+(poem|song|haiku)/i,
];

// ── Identity probe patterns ───────────────────────────────────────────────────
const IDENTITY_PROBE_PATTERNS: RegExp[] = [
    /who\s+are\s+you/i,
    /what\s+are\s+you/i,
    /tell\s+me\s+about\s+yourself/i,
    /introduce\s+yourself/i,
    /what\s+(is|are)\s+your\s+role/i,
    /what\s+do\s+you\s+do/i,
    /describe\s+yourself/i,
    /what\s+kind\s+of\s+(ai|assistant|bot|tutor)\s+are\s+you/i,
];

function extractRoleDescription(policyText: string): string | null {
    const match = policyText.match(/##\s+Role\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/);
    if (!match) return null;
    return match[1].trim();
}

// ── GuardAgent ────────────────────────────────────────────────────────────────

export class GuardAgent implements IGuardAgent {
    constructor(
        private readonly llm: LLMGateway,
        private readonly onJudgeError?: (message: string) => void,
    ) {}

    async check(userPrompt: string, policyText: string, style: TutorStyle): Promise<GuardResult> {
        // Phase 0: language check
        if (isNonEnglish(userPrompt)) {
            return {
                allowed: false,
                reason: 'non-English input',
                action: 'refuse',
                refusalInstruction: NON_ENGLISH_REFUSAL,
            };
        }

        // Phase 0.5: identity probe — answer with Role description only
        for (const pattern of IDENTITY_PROBE_PATTERNS) {
            if (pattern.test(userPrompt)) {
                const roleDescription = extractRoleDescription(policyText);
                if (roleDescription) {
                    return {
                        allowed: false,
                        reason: 'identity probe',
                        action: 'identity',
                        identityResponse: roleDescription,
                    };
                }
                break;
            }
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
                    action: 'refuse',
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
                    action: 'refuse',
                    refusalInstruction: buildRefusalInstruction(prompt, parsed.reason, style),
                };
            }
            return { allowed: true, reason: parsed.reason };
        } catch (err) {
            // Degrade gracefully on malformed JSON or LLM failure — allow through.
            // Emit warning so failures are observable in production.
            this.onJudgeError?.(`llm-judge failed: ${String(err)}`);
            return { allowed: true, reason: 'llm-judge unavailable, allowed by default' };
        }
    }
}
