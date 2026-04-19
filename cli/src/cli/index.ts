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
import { createKnowledgeCommand } from './presentation/knowledge-cli-adapter';
import { KnowledgeService }       from '../application/services/knowledge-service';
import { KnowledgeRepository }    from '../infrastructure/persistence/knowledge-repository';
import { displayBanner }          from './presentation/views/banner';
import { getSettings }            from '../infrastructure/config/settings';
import { createAgentController }  from '../composition/create-agent-controller';

export async function startCLI(): Promise<void> {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const version = packageJson.version;

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
