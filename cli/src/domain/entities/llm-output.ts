/**
 * Domain Entity: LLMOutput
 *
 * A textual output produced by the LLM during a conversation turn.
 * Has no target file path — it is never applied to disk.
 *
 * Types:
 *   code     — code snippet without a target file
 *   analysis — analysis report / explanation
 *   report   — structured report output
 */

export type LLMOutputType = 'code' | 'analysis' | 'report';

export interface LLMOutputJSON {
    id: string;
    type: LLMOutputType;
    content: string;
    createdAt: string;
}

export class LLMOutput {
    readonly createdAt: Date;

    constructor(
        readonly id: string,
        readonly type: LLMOutputType,
        readonly content: string,
        createdAt?: Date,
    ) {
        this.createdAt = createdAt ?? new Date();
    }

    static create(type: LLMOutputType, content: string): LLMOutput {
        const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return new LLMOutput(id, type, content);
    }

    toJSON(): LLMOutputJSON {
        return {
            id: this.id,
            type: this.type,
            content: this.content,
            createdAt: this.createdAt.toISOString(),
        };
    }

    static fromJSON(data: LLMOutputJSON): LLMOutput {
        return new LLMOutput(data.id, data.type, data.content, new Date(data.createdAt));
    }
}
