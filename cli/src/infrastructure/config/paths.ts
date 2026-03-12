/**
 * Centralized persistence paths.
 *
 * Project-scoped data (sessions, knowledge, commands) lives in <cwd>/.mindy/
 * Global data (plugins) stays in ~/.mindy/
 */

import path from 'path';
import fs from 'fs';

export function getProjectBase(): string {
    const dir = path.join(process.cwd(), '.mindy');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function getSessionsDir(): string {
    return path.join(getProjectBase(), 'sessions');
}

export function getLastSessionFile(): string {
    return path.join(getProjectBase(), 'last-session');
}

export function getKnowledgeFile(): string {
    return path.join(getProjectBase(), 'knowledge.json');
}

export function getCommandsDir(): string {
    return path.join(getProjectBase(), 'commands');
}

export function getSettingsFile(): string {
    return path.join(getProjectBase(), 'settings.json');
}
