/**
 * CLI Composition Root
 *
 * Assembles the Commander program, wires commands with their deps, and
 * exposes startCLI() so the top-level dispatcher can call it.
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

import { createAgentCommand } from './presentation/agent-cli-presenter';
import { createAskCommand }   from './presentation/ask-cli-presenter';
import { createKnowledgeCommand } from './presentation/knowledge-cli-presenter';
import { KnowledgeService }       from '../application/services/knowledge-service';
import { KnowledgeRepository }    from '../infrastructure/persistence/knowledge-repository';
import { SessionRepository }      from '../infrastructure/persistence/session-repository';
import { displayBanner }          from './presentation/views/banner';
import { getSettings }            from '../infrastructure/config/settings';
import { createAgentController }  from '../composition/create-agent-controller';

declare const __PKG_VERSION__: string;

function getVersion(): string {
    if (typeof __PKG_VERSION__ !== 'undefined') return __PKG_VERSION__;
    // dev mode fallback: search upward for mindy-rstudio-cli package.json
    for (const rel of ['../../package.json', '../package.json']) {
        try {
            const p = path.join(__dirname, rel);
            const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (pkg.name === 'mindy-rstudio-cli') return pkg.version as string;
        } catch { /* continue */ }
    }
    return '1.0.0';
}

export async function startCLI(): Promise<void> {
    const version = getVersion();

    const program = new Command();

    program
        .name('mindy-cli')
        .description('Agentic CLI for R/RStudio projects — powered by LLM workflows')
        .version(version, '-v, --version', 'Display version number')
        .hook('preAction', () => {
            displayBanner();
        });

    const settings = getSettings();

    const agentCommand = createAgentCommand({
        statusBarItems: settings.statusBar.items,
        repo: new SessionRepository(),
        createController: ({ directory, viewAdapter, approvalGate, installApprovalGate }) =>
            createAgentController({ directory, viewAdapter, approvalGate, installApprovalGate }),
    });

    const askCommand = createAskCommand({
        statusBarItems: settings.statusBar.items,
        createController: ({ directory, viewAdapter }) =>
            createAgentController({
                directory,
                viewAdapter,
                approvalGate: async () => true,
            }),
    });

    program.addCommand(agentCommand);
    program.addCommand(askCommand);
    program.addCommand(createKnowledgeCommand({ service: new KnowledgeService(new KnowledgeRepository()) }));

    program.parse(process.argv);
}
