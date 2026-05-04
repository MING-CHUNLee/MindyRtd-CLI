/**
 * Service: ModeManager
 *
 * Owns the active workflow mode state and persists changes to settings.
 * Pure state + persistence — no LLM, no events.
 */

import { WorkflowMode, getSettings, saveSettings } from '../../infrastructure/config/settings';

export type { WorkflowMode };

export class ModeManager {
    private activeMode: WorkflowMode;

    constructor(initialMode?: WorkflowMode) {
        this.activeMode = initialMode ?? getSettings().workflowMode;
    }

    getMode(): WorkflowMode {
        return this.activeMode;
    }

    setMode(mode: WorkflowMode): void {
        this.activeMode = mode;
        try {
            const settings = getSettings();
            saveSettings({ ...settings, workflowMode: mode });
        } catch {
            // In-memory mode is updated; persistence failure is non-fatal.
            // The change will not survive a restart.
        }
    }

    isDefault(): boolean {
        return this.activeMode === 'default';
    }
}
