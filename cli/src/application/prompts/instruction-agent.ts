/**
 * Prompt: Instruction Agent System Prompt
 *
 * The system prompt used by ExecuteInstructionUseCase when running the
 * ReAct orchestration loop for edit/instruction tasks.
 *
 * Extracted from the inline string in runOrchestration() so that it can be
 * read, tested, and modified independently of the use case logic.
 */

/**
 * Build the system prompt for the instruction-agent ReAct loop.
 *
 * @param directory  - The working directory shown to the LLM
 * @param toolsText  - Formatted tool list (name, description, parameters, example)
 * @param knowledgeText - Optional relevant knowledge entries to inject
 */
export function buildInstructionAgentPrompt(
    directory: string,
    toolsText: string,
    knowledgeText?: string,
): string {
    let prompt =
        'You are an expert coding agent that can edit files and analyze R code. ' +
        'You have access to tools to explore the workspace before making edits.\n\n' +
        `Working directory: ${directory}\n\n` +
        `Available tools:\n${toolsText}`;

    if (knowledgeText) {
        prompt += `\n\n## Relevant Knowledge\n\n${knowledgeText}`;
    }

    return prompt;
}
