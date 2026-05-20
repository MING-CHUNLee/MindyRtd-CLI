import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TutorStyle } from '../use-cases/execute-tutor-use-case';

function getPromptsDir(): string {
    try {
        const __filename = fileURLToPath(import.meta.url);
        return path.dirname(__filename);
    } catch {
        return __dirname;
    }
}

function loadPrompt(name: string): string {
    return fs.readFileSync(path.join(getPromptsDir(), name), 'utf-8');
}

function interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function buildJudgeSystemPrompt(): string {
    const jailbreakCatalog = loadPrompt('jailbreak-strategies.md').trim();
    return interpolate(loadPrompt('guard-judge.md'), { jailbreakCatalog });
}

export function buildRefusalInstruction(blockedPrompt: string, reason: string, style: TutorStyle): string {
    const tutorLabel = style.replace(/^tutor-/, '');
    return interpolate(loadPrompt('guard-refusal.md'), { blockedPrompt, reason, tutorLabel });
}
