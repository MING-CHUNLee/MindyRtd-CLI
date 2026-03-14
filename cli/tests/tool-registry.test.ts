/**
 * Unit Tests: ToolRegistry
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../src/application/services/tool-registry';
import { ITool, ToolInput, ToolResult, ToolSchema } from '../src/domain/interfaces/i-tool';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTool(name: string, result: ToolResult): ITool {
    const schema: ToolSchema = {
        name,
        description: `Test tool: ${name}`,
        parameters: { input: { type: 'string', description: 'test input' } },
    };
    return {
        name,
        schema,
        execute: vi.fn().mockResolvedValue(result),
    };
}

function makeThrowingTool(name: string, errorMessage: string): ITool {
    const schema: ToolSchema = {
        name,
        description: `Throwing tool: ${name}`,
        parameters: {},
    };
    return {
        name,
        schema,
        execute: vi.fn().mockRejectedValue(new Error(errorMessage)),
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ToolRegistry', () => {
    describe('register / get / list', () => {
        it('registers and retrieves a tool by name', () => {
            const registry = new ToolRegistry();
            const tool = makeTool('echo', { content: 'ok', isError: false });

            registry.register(tool);

            expect(registry.get('echo')).toBe(tool);
        });

        it('returns undefined for an unregistered tool name', () => {
            const registry = new ToolRegistry();
            expect(registry.get('nonexistent')).toBeUndefined();
        });

        it('list() returns all registered tools', () => {
            const registry = new ToolRegistry();
            const a = makeTool('a', { content: '', isError: false });
            const b = makeTool('b', { content: '', isError: false });
            registry.register(a);
            registry.register(b);

            const listed = registry.list();
            expect(listed).toHaveLength(2);
            expect(listed.map(t => t.name)).toContain('a');
            expect(listed.map(t => t.name)).toContain('b');
        });

        it('overrides a tool when registered twice with the same name', () => {
            const registry = new ToolRegistry();
            const first = makeTool('dup', { content: 'first', isError: false });
            const second = makeTool('dup', { content: 'second', isError: false });
            registry.register(first);
            registry.register(second);

            expect(registry.get('dup')).toBe(second);
        });
    });

    describe('getSchemas()', () => {
        it('returns schemas for all registered tools', () => {
            const registry = new ToolRegistry();
            registry.register(makeTool('alpha', { content: '', isError: false }));
            registry.register(makeTool('beta', { content: '', isError: false }));

            const schemas = registry.getSchemas();
            expect(schemas.map(s => s.name)).toEqual(expect.arrayContaining(['alpha', 'beta']));
        });
    });

    describe('execute()', () => {
        it('delegates to the tool and returns its result', async () => {
            const registry = new ToolRegistry();
            const tool = makeTool('greet', { content: 'Hello!', isError: false });
            registry.register(tool);

            const result = await registry.execute('greet', { input: 'world' });

            expect(result.content).toBe('Hello!');
            expect(result.isError).toBe(false);
        });

        it('returns an error result for an unregistered tool (never throws)', async () => {
            const registry = new ToolRegistry();

            const result = await registry.execute('missing', {});

            expect(result.isError).toBe(true);
            expect(result.content).toContain('"missing"');
        });

        it('converts a thrown exception into an error ToolResult (never throws)', async () => {
            const registry = new ToolRegistry();
            registry.register(makeThrowingTool('bomb', 'kaboom'));

            const result = await registry.execute('bomb', {});

            expect(result.isError).toBe(true);
            expect(result.content).toContain('kaboom');
        });

        it('passes the input to the underlying tool', async () => {
            const registry = new ToolRegistry();
            const tool = makeTool('echo', { content: '', isError: false });
            registry.register(tool);

            const input: ToolInput = { path: '/some/file.R' };
            await registry.execute('echo', input);

            expect(tool.execute).toHaveBeenCalledWith(input);
        });
    });
});
