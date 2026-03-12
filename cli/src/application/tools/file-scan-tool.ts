/**
 * Tool: FileScanTool
 *
 * Scans a directory for R-related and source files.
 * Wraps the existing file-scanner service.
 */

import path from 'path';
import { ITool, ToolInput, ToolResult, ToolSchema } from '../../domain/interfaces/i-tool';
import { scanDirectory } from '../services/file-scanner';

export class FileScanTool implements ITool {
    readonly name = 'file_scan';

    readonly schema: ToolSchema = {
        name: 'file_scan',
        description: 'Scan a directory for R scripts, R Markdown, data files, and other source files. Returns a structured summary of found files.',
        parameters: {
            directory: {
                type: 'string',
                description: 'The directory path to scan (defaults to current working directory)',
                required: false,
            },
        },
        example: '[ACTION {"tool":"file_scan","input":{"directory":"."}}]',
    };

    async execute(input: ToolInput): Promise<ToolResult> {
        const directory = (input.directory as string | undefined) ?? '.';
        const absDir = path.resolve(directory);

        const result = await scanDirectory({
            targetDir: absDir,
            recursive: true,
            includeHidden: false,
        });

        const lines: string[] = [
            `Scanned: ${absDir}`,
            `Total files: ${result.totalFiles}`,
        ];

        if (result.projectInfo) {
            lines.push(`Project: ${result.projectInfo.name} (${result.projectInfo.type})`);
        }

        const { files } = result;
        if (files.rScripts.length) lines.push(`R scripts (.R): ${files.rScripts.map(f => f.name).join(', ')}`);
        if (files.rMarkdown.length) lines.push(`R Markdown (.Rmd): ${files.rMarkdown.map(f => f.name).join(', ')}`);
        if (files.rData.length) lines.push(`R Data (.RData/.rds): ${files.rData.map(f => f.name).join(', ')}`);
        if (files.rProject.length) lines.push(`R Projects (.Rproj): ${files.rProject.map(f => f.name).join(', ')}`);
        if (files.dataFiles.length) lines.push(`Data files: ${files.dataFiles.map(f => f.name).join(', ')}`);
        if (files.documents.length) lines.push(`Documents: ${files.documents.map(f => f.name).join(', ')}`);

        const content = lines.join('\n');
        return {
            content,
            data: result,
            isError: false,
            estimatedTokens: Math.ceil(content.length / 4),
        };
    }
}
