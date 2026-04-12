/**
 * Composition Root: buildAgentDeps
 *
 * The single place where all infrastructure concrete classes are instantiated
 * and wired together.  Callers (CLI adapter, TUI) receive an AgentControllerDeps
 * object that satisfies the application-layer interface — no infrastructure
 * imports leak into presentation or application layers.
 */

import { LlmGateway } from '../api/llm/gateway/llm-gateway';
import { SessionRepository } from '../persistence/session-repository';
import { LocalFileSystem } from '../filesystem/local-file-system';
import { DirectoryScanner } from '../filesystem/directory-scanner';
import { RScriptRunner } from '../r-adapter/r-script-runner';
import { PluginLoader } from '../filesystem/plugin-loader';

import { DiffEngine } from '../../application/services/diff-engine';
import { ToolRegistry } from '../../application/orchestration/tool-registry';
import { EditStagingService } from '../../application/services/edit-staging-service';
import { FileReadService } from '../../application/services/file-read-service';
import { FileScanTool } from '../../application/tools/file-scan-tool';
import { FileReadTool } from '../../application/tools/file-read-tool';
import { FileEditTool } from '../../application/tools/file-edit-tool';
import { PdfReadTool } from '../../application/tools/pdf-read-tool';
import { RExecTool } from '../../application/tools/r-exec-tool';
import { RInstallTool } from '../../application/tools/r-install-tool';
import { RRenderTool } from '../../application/tools/r-render-tool';
import { LibraryScanTool } from '../../application/tools/library-scan-tool';

import type { AgentControllerDeps } from '../../application/controllers/agent-controller';

export function buildAgentDeps(): AgentControllerDeps {
    const llm         = LlmGateway.fromEnv();
    const repo        = new SessionRepository();
    const diffEngine  = new DiffEngine();
    const fs          = new LocalFileSystem();
    const registry    = new ToolRegistry();

    // stagingService is shared between FileEditTool (which queues edits during ReAct)
    // and the instruction/solver use cases (which drain the queue after the loop).
    const stagingService  = new EditStagingService(fs, diffEngine);
    const fileReadService = new FileReadService(fs);
    const rRunner         = new RScriptRunner();

    registry.register(new FileScanTool(new DirectoryScanner()));
    registry.register(new FileReadTool(fileReadService));
    registry.register(new FileEditTool(stagingService));
    registry.register(new PdfReadTool(fs));
    registry.register(new RExecTool(rRunner));
    registry.register(new RInstallTool());
    registry.register(new RRenderTool(fs, rRunner));
    registry.register(new LibraryScanTool());

    return {
        llm,
        repo,
        diffEngine,
        registry,
        stagingService,
        pluginLoader: new PluginLoader(),
    };
}
