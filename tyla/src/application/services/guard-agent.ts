import { LLMGateway } from '../../domain/types/llm-gateway';
import { GuardResult, GuardLogEntry, IGuardAgent, GUARD_ATTACK_THRESHOLD } from '../../domain/types/guard-agent';
import type { TutorStyle } from '../use-cases/execute-tutor-use-case';
import { buildJudgeSystemPrompt, buildRefusalInstruction } from '../prompts/guard-agent';

export class GuardAgent implements IGuardAgent {
    constructor(
        private readonly llm: LLMGateway,
        private readonly onJudgeError?: (message: string) => void,
        private readonly onLog?: (entry: GuardLogEntry) => void,
    ) {}

    async check(userPrompt: string, policyText: string, style: TutorStyle): Promise<GuardResult> {
        return this.runLLMJudge(userPrompt, policyText, style);
    }

    private async runLLMJudge(prompt: string, policyText: string, style: TutorStyle): Promise<GuardResult> {
        try {
            const response = await this.llm.sendPrompt({
                systemPrompt: buildJudgeSystemPrompt(),
                userMessage: prompt,
            });

            const parsed = JSON.parse(response.content.trim()) as { 'attack-probability': number; evaluation: string };
            const attackProb = parsed['attack-probability'];
            const evaluation = parsed.evaluation;
            if (
                typeof attackProb !== 'number' ||
                typeof evaluation !== 'string' ||
                attackProb < 0 || attackProb > 1
            ) {
                throw new Error('unexpected JSON shape');
            }

            const probability = { attack: attackProb, benign: 1 - attackProb };
            const allowed = attackProb < GUARD_ATTACK_THRESHOLD;

            this.onLog?.({
                timestamp: new Date().toISOString(),
                userPrompt: prompt,
                probability,
                reason: evaluation,
                allowed,
            });

            if (!allowed) {
                return {
                    allowed: false,
                    reason: evaluation,
                    probability,
                    action: 'refuse',
                    refusalInstruction: buildRefusalInstruction(prompt, evaluation, style),
                };
            }
            return { allowed: true, reason: evaluation, probability };
        } catch (err) {
            this.onJudgeError?.(`llm-judge failed: ${String(err)}`);
            return { allowed: true, reason: 'llm-judge unavailable, allowed by default' };
        }
    }
}
