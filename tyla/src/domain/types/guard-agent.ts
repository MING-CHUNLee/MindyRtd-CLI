import type { TutorStyle } from '../../application/use-cases/execute-tutor-use-case';

export type GuardResult =
    | { allowed: true; reason: string }
    | { allowed: false; reason: string; action: 'refuse';   refusalInstruction: string }
    | { allowed: false; reason: string; action: 'identity'; identityResponse: string };

export interface IGuardAgent {
    check(userPrompt: string, tutorPolicyText: string, style: TutorStyle): Promise<GuardResult>;
}
