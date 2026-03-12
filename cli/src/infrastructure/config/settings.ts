/**
 * User settings loader.
 *
 * Reads <cwd>/.mindy/settings.json for user preferences.
 * Returns sensible defaults when the file is missing or invalid.
 */

import fs from 'fs';
import { getSettingsFile } from './paths';

export const VALID_STATUS_ITEMS = [
    'model', 'context', 'rpm', 'cost', 'turn', 'duration', 'tps', 'latency',
] as const;

export type StatusBarItem = typeof VALID_STATUS_ITEMS[number];

const DEFAULT_STATUS_ITEMS: StatusBarItem[] = ['model', 'context', 'rpm'];

export interface Settings {
    statusBar: {
        items: StatusBarItem[];
    };
}

export function getSettings(): Settings {
    const defaults: Settings = {
        statusBar: { items: [...DEFAULT_STATUS_ITEMS] },
    };

    try {
        const raw = fs.readFileSync(getSettingsFile(), 'utf-8');
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed?.statusBar?.items)) {
            const valid = parsed.statusBar.items.filter(
                (k: unknown): k is StatusBarItem =>
                    typeof k === 'string' && (VALID_STATUS_ITEMS as readonly string[]).includes(k),
            );
            if (valid.length > 0) {
                defaults.statusBar.items = valid;
            }
        }
    } catch {
        // Missing or invalid file — use defaults
    }

    return defaults;
}
