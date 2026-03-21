/**
 * Tool: FileEditTool
 *
 * Encapsulates all file-write I/O for the agent edit pipeline.
 *
 * Responsibilities:
 *   1. execute()            — read original, compute diff, stage the proposal in memory.
 *                             Returns an [OBSERVATION] to the LLM; nothing is written yet.
 *   2. drainStagedEdits()  — called by the use case after the ReAct loop; returns every
 *                             proposal and clears the internal queue.
 *   3. applyEdit()         — called per approved edit; the only place fs.writeFileSync lives.
 *
 * The use case is responsible for the approval gate between drainStagedEdits() and applyEdit().
 */

import fs from 'fs';
import path from 'path';
import { AgentTool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/agent-tool';
import { DiffEngine } from '../services/diff-engine';
import { isFilenameEditable } from '../../domain/lib/agent-file-filters';

export interface StagedEdit {
    path: string;        // relative path as given by the LLM
    content: string;     // proposed new content
    original: string;    // content that was on disk at staging time ('' for new files)
    diff: string;        // coloured diff string ready for display
}

export class FileEditTool implements AgentTool {
    readonly name = 'file_edit';

    readonly schema: ToolSchema = {
        name: 'file_edit',
        description:
            'Propose a complete replacement of a file\'s content. ' +
            'The change is staged for human review — nothing is written until the user approves. ' +
            'Always read the file with file_read first so you send the full corrected content.',
        parameters: {
            path: {
                type: 'string',
                description: 'File path to edit (absolute or relative to cwd)',
                required: true,
            },
            content: {
                type: 'string',
                description: 'The complete new content for the file',
                required: true,
            },
        },
        example: '[ACTION {"tool":"file_edit","input":{"path":"analysis.R","content":"# corrected code\\n..."}}]',
    };

    private readonly _staged: StagedEdit[] = [];

    constructor(private readonly diffEngine: DiffEngine) {}

    async execute(input: ToolInput): Promise<ToolResult> {
        const filePath = input.path as string | undefined;
        const content = input.content as string | undefined;

        if (!filePath?.trim()) {
            return { content: 'No file path provided.', isError: true };
        }
        if (content === undefined || content === null) {
            return { content: 'No content provided.', isError: true };
        }
        if (!isFilenameEditable(filePath)) {
            return {
                content: `${path.basename(filePath)} is not an editable source file.`,
                isError: true,
            };
        }

        const absPath = path.resolve(filePath);
        const exists = fs.existsSync(absPath);

        let original = '';
        if (exists) {
            try {
                original = fs.readFileSync(absPath, 'utf8');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return { content: `Cannot read ${path.basename(absPath)}: ${msg}`, isError: true };
            }
        }

        if (original === content) {
            return {
                content: `No changes detected in ${path.basename(absPath)} — file already matches proposed content.`,
                isError: false,
            };
        }

        const diff = this.diffEngine.generateColoredDiff(original, content);
        this._staged.push({ path: filePath, content, original, diff });

        const action = exists ? 'modification' : 'new file';
        return {
            content: `Edit staged for ${path.basename(absPath)} (${action}). Awaiting human approval before writing.`,
            data: { path: filePath, staged: true },
            isError: false,
        };
    }

    /**
     * Retrieve and clear all staged edits.
     * Called once by the use case after the ReAct loop completes.
     */
    drainStagedEdits(): StagedEdit[] {
        return this._staged.splice(0);
    }

    /**
     * Write an approved edit to disk.
     * Called by the use case for each edit the user accepts.
     */
    applyEdit(edit: StagedEdit): void {
        const absPath = path.resolve(edit.path);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, edit.content, 'utf8');
    }
}
