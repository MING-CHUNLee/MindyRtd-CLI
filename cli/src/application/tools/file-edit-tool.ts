/**
 * Tool: FileEditTool
 *
 * AgentTool adapter for the edit pipeline.  Validates the LLM's tool-call
 * input and delegates staging to EditStagingService — no fs I/O lives here.
 *
 * Staging queue, diff computation, and disk writes all live in EditStagingService,
 * which is shared with ExecuteInstructionUseCase so it can drain, review, and
 * apply the edits after the ReAct loop ends.
 */

import path from 'path';
import { AgentTool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/agent-tool';
import { EditStagingService } from '../services/edit-staging-service';
import { isFilenameEditable } from '../../domain/policies/agent-file-policy';

// Re-export so callers that imported StagedEdit from this module still compile.
export type { StagedEdit } from '../services/edit-staging-service';

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

    constructor(private readonly stagingService: EditStagingService) {}

    async execute(input: ToolInput): Promise<ToolResult> {
        const filePath = input.path as string | undefined;
        const content = input.content as string | undefined;

        if (!filePath?.trim()) return { content: 'No file path provided.', isError: true };
        if (content == null) return { content: 'No content provided.', isError: true };
        if (!isFilenameEditable(filePath)) {
            return { content: `${path.basename(filePath)} is not an editable source file.`, isError: true };
        }

        const result = this.stagingService.stage(filePath, content);
        if ('error' in result) return { content: result.error, isError: result.isHardError };

        return {
            content: `Edit staged for ${path.basename(filePath)}. Awaiting human approval before writing.`,
            data: { path: filePath, staged: true },
            isError: false,
        };
    }
}
