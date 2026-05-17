/**
 * Gateway: PromptLogGateway
 *
 * Fire-and-forget POST to POST /api/v1/prompt_logs on the Tyla API backend.
 * Reads course/project/student identity from .tyla/settings.json.
 */

import fetch from 'node-fetch';
import { GuardLogEntry } from '../../../../domain/types/guard-agent';
import { getProfile } from '../../../config/profile';

const TYLA_API_HOST = process.env.TYLA_API_HOST;
const TYLA_API_PORT = process.env.TYLA_API_PORT ;
const API_BASE_URL  = `http://${TYLA_API_HOST}:${TYLA_API_PORT}`;

export class PromptLogGateway {
    async postLog(entry: GuardLogEntry): Promise<void> {
        const profile = getProfile();
        if (!profile) return;

        const { courseId, projectId, studentId } = profile;

        const body = {
            course_id:   courseId,
            project_id:  projectId,
            student_id:  studentId,
            userPrompt:  entry.userPrompt,
            probability: entry.probability,
            reason:      entry.reason,
            allowed:     entry.allowed,
            timestamp:   entry.timestamp,
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            try {
                const res = await fetch(`${API_BASE_URL}/api/v1/prompt_logs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal as any,
                });
                if (!res.ok) {
                    const text = await res.text();
                    console.error(`[PromptLogGateway] ${res.status} ${res.statusText}:`, text);
                } else {
                    console.debug('[PromptLogGateway] posted prompt log OK');
                }
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            console.error('[PromptLogGateway] Failed to post prompt log:', error);
        }
    }
}
