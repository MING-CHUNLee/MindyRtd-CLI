import type { TutorStyle } from '../../application/use-cases/execute-tutor-use-case';

export interface GuardResult {
    allowed: boolean;
    reason: string;
    /** When allowed=false, pass this as the instruction to the tutor for in-persona refusal. */
    refusalInstruction?: string;
    /** When set, return this text directly to the user — no LLM call needed. */
    identityResponse?: string;
}

export interface IGuardAgent {
    check(userPrompt: string, tutorPolicyText: string, style: TutorStyle): Promise<GuardResult>;
}
