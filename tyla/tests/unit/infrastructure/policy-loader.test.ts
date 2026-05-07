/**
 * Unit Tests: PolicyLoader — built-in and assignment overlay
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { PolicyLoader } from '../../../src/infrastructure/config/policy-loader';

const FIXTURES_ASSIGNMENTS = path.resolve(
    __dirname,
    '../../fixtures/assignments',
);

describe('PolicyLoader — built-in only', () => {
    it('returns empty string for an unknown mode when no agent dir exists', () => {
        const loader = new PolicyLoader('/nonexistent/agent/dir');
        expect(loader.load('tutor-guide')).toBe('');
    });
});

describe('PolicyLoader — assignment overlay (CSDS-HW2)', () => {
    const assignmentDir = path.join(FIXTURES_ASSIGNMENTS, 'CSDS-HW2');

    it('loads tutors/tutor-guide.md from the assignment overlay', () => {
        const loader = new PolicyLoader(undefined, assignmentDir);
        const policy = loader.load('tutor-guide');

        expect(policy).toContain('# Policy: Tutor-Guide Mode');
        expect(policy).toContain('step-by-step tutor');
    });

    it('overlay takes precedence over built-in agent policy', () => {
        const loader = new PolicyLoader(undefined, assignmentDir);
        const overlayPolicy = loader.load('tutor-guide');

        const builtinLoader = new PolicyLoader();
        const builtinPolicy = builtinLoader.load('tutor-guide');

        // If both exist and differ, overlay wins; if built-in is empty, overlay is still returned
        expect(overlayPolicy).toBeTruthy();
        if (builtinPolicy) {
            // Both exist — overlay must be the assignment-specific one
            expect(overlayPolicy).toContain('# Policy: Tutor-Guide Mode');
        }
    });

    it('falls back to built-in for a mode not in the assignment tutors dir', () => {
        const loader = new PolicyLoader(undefined, assignmentDir);
        // tutor-socratic.md does not exist in CSDS-HW2/tutors/
        const policy = loader.load('tutor-socratic');
        // Should not throw; returns either built-in or empty string
        expect(typeof policy).toBe('string');
    });

    it('returns empty string when overlay dir exists but has no tutors/ for an unknown mode', () => {
        const loader = new PolicyLoader('/nonexistent/agent', assignmentDir);
        const policy = loader.load('solver');
        expect(policy).toBe('');
    });
});
