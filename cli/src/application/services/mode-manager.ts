/**
 * Service: ModeManager
 *
 * Owns the active workflow mode state and persists changes to settings.
 * Pure state + persistence — no LLM, no events.
 */

import { WorkflowMode, getSettings, saveSettings } from '../../infrastructure/config/settings';

export class ModeManager {
    private activeMode: WorkflowMode;

    constructor() {
        this.activeMode = getSettings().workflowMode;
    }

    getMode(): WorkflowMode {
        return this.activeMode;
    }

    setMode(mode: WorkflowMode): void {
        this.activeMode = mode;
        const settings = getSettings();
        saveSettings({ ...settings, workflowMode: mode });
    }

    isDefault(): boolean {
        return this.activeMode === 'default';
    }
}
