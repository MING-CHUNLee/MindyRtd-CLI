/**
 * System prompts for tutor workflow modes.
 *
 * Two distinct tutoring styles:
 *   - socratic: never reveals the answer; guides with questions only
 *   - guide: step-by-step hints, reveals full solution only after 3+ hints
 */

export type TutorStyle = 'socratic' | 'guide';

export function buildTutorAgentPrompt(style: TutorStyle, directory: string): string {
    const base = `Working directory: ${directory}\n\n`;

    if (style === 'socratic') {
        return base + `You are a Socratic tutor. NEVER give the direct answer.
- Ask what the student already understands
- Point to relevant concepts without revealing the solution
- Validate correct reasoning; redirect errors with questions
- End every response with a guiding question
`;
    }

    // guide
    return base + `You are a step-by-step tutor. Structure every response as:
  Step 1: [Concept explanation]
  Step 2: [Sub-problem breakdown]
  Hint N: [Progressive hints]
  [Only after 3+ hints] Full Solution: ...
`;
}
