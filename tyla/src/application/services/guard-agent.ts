import { LLMGateway } from '../../domain/types/llm-gateway';
import { GuardResult, GuardLogEntry, IGuardAgent, GUARD_ATTACK_THRESHOLD } from '../../domain/types/guard-agent';
import type { TutorStyle } from '../use-cases/execute-tutor-use-case';
import { buildJudgeSystemPrompt, buildRefusalInstruction } from '../prompts/guard-agent';

const PROB_SUM_EPSILON = 0.01;

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
                systemPrompt: buildJudgeSystemPrompt(policyText),
                userMessage: prompt,
            });

            const parsed = JSON.parse(response.content.trim()) as { attack: number; benign: number; reason: string };
            if (
                typeof parsed.attack !== 'number' ||
                typeof parsed.benign !== 'number' ||
                typeof parsed.reason !== 'string' ||
                parsed.attack < 0 || parsed.attack > 1 ||
                parsed.benign < 0 || parsed.benign > 1 ||
                Math.abs(parsed.attack + parsed.benign - 1) > PROB_SUM_EPSILON
            ) {
                throw new Error('unexpected JSON shape');
            }

            const probability = { attack: parsed.attack, benign: parsed.benign };
            const allowed = parsed.attack < GUARD_ATTACK_THRESHOLD;

            this.onLog?.({
                timestamp: new Date().toISOString(),
                userPrompt: prompt,
                probability,
                reason: parsed.reason,
                allowed,
            });

            if (!allowed) {
                return {
                    allowed: false,
                    reason: parsed.reason,
                    probability,
                    action: 'refuse',
                    refusalInstruction: buildRefusalInstruction(prompt, parsed.reason, style),
                };
            }
            return { allowed: true, reason: parsed.reason, probability };
        } catch (err) {
            this.onJudgeError?.(`llm-judge failed: ${String(err)}`);
            return { allowed: true, reason: 'llm-judge unavailable, allowed by default' };
        }
    }
}
