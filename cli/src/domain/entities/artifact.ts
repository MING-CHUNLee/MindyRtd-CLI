/**
 * @deprecated
 *
 * Legacy type used only for backward-compatible deserialization of session
 * files written before the FileChange / LLMOutput split.
 *
 * Do NOT use this in new code. Use FileChange or LLMOutput instead.
 */

export interface ArtifactJSON {
    id: string;
    type: 'edit' | 'diff' | 'code' | 'analysis' | 'report';
    path?: string;
    content: string;
    createdAt: string;
}
