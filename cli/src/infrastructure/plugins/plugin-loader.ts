/**
 * Infrastructure: PluginLoader
 *
 * Implements the Plugin System (§2.4.1 缺失: Plugins) from the architecture plan.
 *
 * Plugins live at: ~/.mindy/plugins/<name>.js
 *
 * Each plugin file must export a default (or named) object/class satisfying ITool:
 *   module.exports = { name, schema, execute }     // CommonJS
 *   module.exports.default = <class>               // or default export
 *
 * The PluginLoader:
 *   1. Discovers all .js files in the plugin directory
 *   2. require()s each one in a try/catch
 *   3. Validates the ITool contract (name + schema + execute)
 *   4. Registers valid plugins with the ToolRegistry
 *
 * Security: plugins run with the same Node.js privileges as the CLI.
 * Users should only install plugins they trust.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ITool, ToolInput, ToolResult, ToolSchema } from '../../application/domain/interfaces/i-tool';
import { ToolRegistry } from '../../application/services/tool-registry';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PluginMeta {
    filePath: string;
    name: string;
    description: string;
    loaded: boolean;
    error?: string;
}

// ── PluginLoader ──────────────────────────────────────────────────────────────

export class PluginLoader {
    private readonly pluginDir: string;

    constructor(pluginDir?: string) {
        this.pluginDir = pluginDir ?? path.join(os.homedir(), '.mindy', 'plugins');
    }

    /**
     * Discover .js files in the plugin directory.
     * Returns paths even if the directory doesn't exist (returns []).
     */
    discover(): string[] {
        if (!fs.existsSync(this.pluginDir)) return [];
        return fs
            .readdirSync(this.pluginDir)
            .filter(f => f.endsWith('.js'))
            .map(f => path.join(this.pluginDir, f));
    }

    /**
     * Attempt to load a single plugin file and extract an ITool from it.
     * Returns null (with warning) if the file doesn't satisfy the ITool contract.
     */
    loadOne(filePath: string): ITool | null {
        let mod: unknown;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            mod = require(filePath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[plugin] Failed to load "${path.basename(filePath)}": ${msg}`);
            return null;
        }

        // Support { default: ITool }, { name, schema, execute }, or a class instance
        const candidate =
            (mod as Record<string, unknown>)?.default ??
            mod;

        // If it's a constructor (class), instantiate it
        let tool: unknown = candidate;
        if (typeof candidate === 'function') {
            try { tool = new (candidate as new () => unknown)(); } catch { tool = candidate; }
        }

        if (!isITool(tool)) {
            console.warn(`[plugin] "${path.basename(filePath)}" does not export a valid ITool (needs name, schema, execute).`);
            return null;
        }

        return tool;
    }

    /**
     * Load all discovered plugins and register valid ones into the registry.
     *
     * @returns Array of PluginMeta describing each discovered file's outcome.
     */
    async loadAll(registry: ToolRegistry): Promise<PluginMeta[]> {
        const files = this.discover();
        const results: PluginMeta[] = [];

        for (const filePath of files) {
            const tool = this.loadOne(filePath);
            if (tool) {
                registry.register(tool);
                results.push({
                    filePath,
                    name: tool.name,
                    description: tool.schema.description,
                    loaded: true,
                });
            } else {
                results.push({
                    filePath,
                    name: path.basename(filePath, '.js'),
                    description: '(failed to load)',
                    loaded: false,
                    error: 'Invalid ITool export',
                });
            }
        }

        return results;
    }

    /** Return the plugin directory path (creates it if missing). */
    ensureDir(): string {
        fs.mkdirSync(this.pluginDir, { recursive: true });
        return this.pluginDir;
    }
}

// ── ITool type guard ──────────────────────────────────────────────────────────

function isITool(obj: unknown): obj is ITool {
    if (typeof obj !== 'object' || obj === null) return false;
    const o = obj as Record<string, unknown>;
    return (
        typeof o.name     === 'string'   &&
        typeof o.schema   === 'object'   && o.schema !== null &&
        typeof o.execute  === 'function'
    );
}
