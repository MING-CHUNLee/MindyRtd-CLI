/**
 * CliAgentController
 *
 * Thin CLI-layer coordinator: manages spinner state and delegates execution
 * to AgentService. Pure CLI concerns only (no Commander, no chalk rendering).
 *
 * Rendering callbacks (viewAdapter, approvalGate) are built by
 * agent-cli-presenter.ts and injected here.
 */

import type { Ora } from 'ora';
import type { AgentService } from '../../application/services/agent-service';
import type { AgentEvent, ProposedEdit, ProposedInstall, EventCallback, ApprovalCallback, InstallApprovalCallback } from '../../application/controllers/agent-controller';
import { displayStatusBar } from '../presentation/views/context-status-bar';
import type { StatusBarItemKey } from '../../shared/view-models';
import type { WorkflowMode } from '../../application/services/mode-manager';

export interface CliAgentControllerDeps {
    createController: (args: {
        directory: string;
        viewAdapter: EventCallback;
        approvalGate: ApprovalCallback;
        installApprovalGate: InstallApprovalCallback;
    }) => AgentService;
    statusBarItems: StatusBarItemKey[];
}

export interface AgentOptions {
    directory: string;
    resume: boolean;
    session?: string;
    new: boolean;
}

export class CliAgentController {
    private spinner: Ora | null = null;
    private controllerRef?: AgentService;

    constructor(private readonly deps: CliAgentControllerDeps) {}

    getSpinner(): Ora | null { return this.spinner; }
    setSpinner(s: Ora | null): void { this.spinner = s; }
    getMode(): WorkflowMode | undefined { return this.controllerRef?.getMode(); }

    async execute(
        instruction: string,
        options: AgentOptions,
        viewAdapter: EventCallback,
        approvalGate: ApprovalCallback,
        installApprovalGate: InstallApprovalCallback,
    ): Promise<void> {
        const controller = this.deps.createController({
            directory: options.directory,
            viewAdapter,
            approvalGate,
            installApprovalGate,
        });
        this.controllerRef = controller;

        await controller.initialize({
            sessionId: options.session,
            forceNew:  options.new,
        });

        await controller.executeInstruction(instruction);

        const session = controller.getSession();
        const mode    = controller.getMode();
        displayStatusBar(
            {
                model:               session.model,
                usagePercent:        session.tokenBudget.usagePercent,
                health:              session.tokenBudget.health,
                totalCostUSD:        session.totalCostUSD,
                turnCount:           session.turnCount,
                requestsPerMinute:   session.requestsPerMinute,
                lastTokensPerSecond: session.lastTokensPerSecond,
                lastResponseTimeMs:  session.lastResponseTimeMs,
                elapsedMs:           session.elapsedMs,
            },
            {
                items:        this.deps.statusBarItems,
                workflowMode: mode,
            },
        );
    }
}
