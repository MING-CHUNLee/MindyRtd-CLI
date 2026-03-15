/**
 * Utility: JSON Array Extractor
 *
 * Extracts the first JSON array substring from an LLM text response.
 * Used by Evaluator, Orchestrator, and PackageInstaller.
 *
 * @param text - Raw LLM output that may contain a JSON array
 * @returns The matched JSON array string, or null if none found
 */
export function extractJsonArray(text: string): string | null {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? match[0] : null;
}
