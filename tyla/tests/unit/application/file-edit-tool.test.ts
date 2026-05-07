/**
 * Unit Tests: FileEditTool
 *
 * EditStagingService is injected as a mock — no real fs or diff computation.
 * All validation logic lives in FileEditTool.execute(), so these are pure unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { FileEditTool } from '../../../src/application/tools/file-edit-tool';
import { EditStagingService } from '../../../src/application/services/edit-staging-service';
import { StagedEdit } from '../../../src/application/services/edit-staging-service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockStagingService(stageResult: ReturnType<EditStagingService['stage']>): EditStagingService {
    return {
        stage: vi.fn().mockReturnValue(stageResult),
        drainStagedEdits: vi.fn().mockReturnValue([]),
        stageFromArtifacts: vi.fn().mockReturnValue([]),
        applyEdit: vi.fn(),
    } as unknown as EditStagingService;
}

const MOCK_STAGED: StagedEdit = {
    path: 'analysis.R',
    content: 'x <- 1\n',
    original: '',
    diff: '+ x <- 1\n',
};

function makeSuccessService() {
    return makeMockStagingService({ staged: MOCK_STAGED });
}

function makeHardErrorService() {
    return makeMockStagingService({ error: 'Cannot read file.R', isHardError: true });
}

function makeSoftErrorService() {
    return makeMockStagingService({ error: 'No changes detected in file.R — already matches.', isHardError: false });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FileEditTool', () => {
    describe('execute() — input validation', () => {
        it('returns isError:true when path is missing', async () => {
            const tool = new FileEditTool(makeSuccessService());

            const result = await tool.execute({ content: 'x <- 1\n' });

            expect(result.isError).toBe(true);
            expect(result.content).toContain('No file path');
        });

        it('returns isError:true when path is empty string', async () => {
            const tool = new FileEditTool(makeSuccessService());

            const result = await tool.execute({ path: '  ', content: 'x <- 1\n' });

            expect(result.isError).toBe(true);
        });

        it('returns isError:true when content is null/undefined', async () => {
            const tool = new FileEditTool(makeSuccessService());

            const result = await tool.execute({ path: 'analysis.R' });

            expect(result.isError).toBe(true);
            expect(result.content).toContain('No content');
        });

        it('returns isError:true for a non-editable extension (.exe)', async () => {
            const tool = new FileEditTool(makeSuccessService());

            const result = await tool.execute({ path: 'virus.exe', content: 'x <- 1\n' });

            expect(result.isError).toBe(true);
            expect(result.content).toContain('is not an editable source file');
        });

        it('returns isError:true for a binary extension (.png)', async () => {
            const tool = new FileEditTool(makeSuccessService());

            const result = await tool.execute({ path: 'plot.png', content: 'binary stuff' });

            expect(result.isError).toBe(true);
        });
    });

    describe('execute() — staging delegation', () => {
        it('calls stagingService.stage() with the provided path and content', async () => {
            const stagingService = makeSuccessService();
            const tool = new FileEditTool(stagingService);

            await tool.execute({ path: 'analysis.R', content: 'x <- 1\n' });

            expect(stagingService.stage).toHaveBeenCalledWith('analysis.R', 'x <- 1\n');
        });

        it('returns isError:false and a confirmation message on successful staging', async () => {
            const tool = new FileEditTool(makeSuccessService());

            const result = await tool.execute({ path: 'analysis.R', content: 'x <- 1\n' });

            expect(result.isError).toBe(false);
            expect(result.content).toContain('staged');
        });

        it('returns isError:true when stagingService returns a hard error', async () => {
            const tool = new FileEditTool(makeHardErrorService());

            const result = await tool.execute({ path: 'analysis.R', content: 'content\n' });

            expect(result.isError).toBe(true);
            expect(result.content).toContain('Cannot read');
        });

        it('returns isError:false when stagingService returns a soft error (no changes)', async () => {
            const tool = new FileEditTool(makeSoftErrorService());

            const result = await tool.execute({ path: 'analysis.R', content: 'same content\n' });

            expect(result.isError).toBe(false);
            expect(result.content).toContain('No changes detected');
        });
    });

    describe('tool metadata', () => {
        it('has the correct name "file_edit"', () => {
            const tool = new FileEditTool(makeSuccessService());
            expect(tool.name).toBe('file_edit');
        });

        it('schema has required parameters: path and content', () => {
            const tool = new FileEditTool(makeSuccessService());
            expect(tool.schema.parameters.path.required).toBe(true);
            expect(tool.schema.parameters.content.required).toBe(true);
        });
    });
});
