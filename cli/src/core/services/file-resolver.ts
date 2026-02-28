import { FileInfo } from '../../shared/types';
import * as fs from 'fs';
import { LLMController } from '../../infrastructure/api/llm-controller';

export interface FileContext {
    path: string;
    content: string;
}

/**
 * Service: File Resolver (Agent CLI Phase 1 & 2)
 *
 * Scans file contents and uses LLM to determine which files need to be edited,
 * then retrieves updated contents.
 */
export class FileResolver {
    private llmController: LLMController;

    constructor(llmController?: LLMController) {
        this.llmController = llmController || LLMController.fromEnv();
    }

    /**
     * Phase 1: Resolve files needed for the task
     * Reads the first few lines of each file and asks LLM to filter them.
     */
    async resolveRelevantFiles(instruction: string, files: FileInfo[], previewLines = 10): Promise<string[]> {
        console.log(`[Phase 1] Resolving relevant files out of ${files.length} files...`);
        const fileContexts: FileContext[] = files.map(file => {
            try {
                const content = fs.readFileSync(file.path, 'utf8');
                const preview = content.split('\n').slice(0, previewLines).join('\n');
                return { path: file.path, content: preview };
            } catch (e) {
                return { path: file.path, content: '' };
            }
        }).filter(f => f.content.length > 0);

        return this.llmController.resolveFiles(instruction, fileContexts);
    }

    /**
     * Phase 2: Edit files based on instruction
     * Reads full content of matched files and asks LLM to provide modified content.
     */
    async generateEdits(instruction: string, filePaths: string[]): Promise<FileContext[]> {
        console.log(`[Phase 2] Generating edits for ${filePaths.length} files...`);
        const fileContexts: FileContext[] = filePaths.map(filePath => {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                return { path: filePath, content };
            } catch (e) {
                return { path: filePath, content: '' };
            }
        }).filter(f => f.content.length > 0);

        return this.llmController.editFiles(instruction, fileContexts);
    }
}
