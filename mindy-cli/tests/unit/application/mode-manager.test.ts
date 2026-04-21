/**
 * Unit Tests: ModeManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/config/settings', () => ({
    getSettings: vi.fn().mockReturnValue({ statusBar: { items: [] }, workflowMode: 'default' }),
    saveSettings: vi.fn(),
}));

import { ModeManager } from '../../../src/application/services/mode-manager';
import { getSettings, saveSettings } from '../../../src/infrastructure/config/settings';

describe('ModeManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({ statusBar: { items: [] }, workflowMode: 'default' });
    });

    it('initializes with mode from settings', () => {
        const mgr = new ModeManager();
        expect(mgr.getMode()).toBe('default');
    });

    it('initializes with non-default mode from settings', () => {
        (getSettings as ReturnType<typeof vi.fn>).mockReturnValue({ statusBar: { items: [] }, workflowMode: 'solver' });
        const mgr = new ModeManager();
        expect(mgr.getMode()).toBe('solver');
    });

    it('setMode updates the active mode', () => {
        const mgr = new ModeManager();
        mgr.setMode('tutor-socratic');
        expect(mgr.getMode()).toBe('tutor-socratic');
    });

    it('setMode persists to settings', () => {
        const mgr = new ModeManager();
        mgr.setMode('solver');
        expect(saveSettings).toHaveBeenCalledWith(
            expect.objectContaining({ workflowMode: 'solver' }),
        );
    });

    it('isDefault returns true when mode is default', () => {
        const mgr = new ModeManager();
        expect(mgr.isDefault()).toBe(true);
    });

    it('isDefault returns false when mode is not default', () => {
        const mgr = new ModeManager();
        mgr.setMode('tutor-guide');
        expect(mgr.isDefault()).toBe(false);
    });
});
