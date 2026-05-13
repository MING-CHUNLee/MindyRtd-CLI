import type { TutorStyle } from '../../application/use-cases/execute-tutor-use-case';

/** Minimum attack probability (0–1) required to refuse. */
export const GUARD_ATTACK_THRESHOLD = 0.65;

/** Probability pair where attack + benign = 1.0. */
export type GuardProbability = { attack: number; benign: number };

/** One entry written to the guard log per LLM judge call. */
export type GuardLogEntry = {
    timestamp: string;       // ISO-8601
    userPrompt: string;
    probability: GuardProbability;
    reason: string;
    allowed: boolean;
};

export type GuardResult =
    | { allowed: true;  reason: string; probability?: GuardProbability }
    | { allowed: false; reason: string; probability?: GuardProbability; action: 'refuse';   refusalInstruction: string }
    | { allowed: false; reason: string; probability?: GuardProbability; action: 'identity'; identityResponse: string };

export interface IGuardAgent {
    check(userPrompt: string, tutorPolicyText: string, style: TutorStyle): Promise<GuardResult>;
}
