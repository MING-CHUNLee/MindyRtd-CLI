/**
 * Composition Root: createAgentController
 *
 * A single entry-point for wiring an AgentController with its fully assembled
 * dependencies (built by infrastructure/bootstrap/agent-factory.ts).
 *
 * This module is intentionally outside application/ and presentation/ to keep
 * strict Clean Architecture boundaries:
 * - presentation/ never imports infrastructure/
 * - application/ never imports infrastructure/
 */

import {
    AgentController,
    type AgentEvent,
    type ProposedEdit,
    type ProposedInstall,
} from '../application/controllers/agent-controller';

import {
    buildAgentDeps,
} from '../infrastructure/bootstrap/agent-factory';

export interface CreateAgentControllerArgs {
    directory: string;
    viewAdapter: (event: AgentEvent) => void;
    approvalGate: (edit: ProposedEdit) => Promise<boolean>;
    installApprovalGate?: (plan: ProposedInstall) => Promise<boolean>;
}

export function createAgentController(args: CreateAgentControllerArgs): AgentController {
    return new AgentController(
        { directory: args.directory },
        args.viewAdapter,
        buildAgentDeps(args.directory, args.approvalGate, args.installApprovalGate),
    );
}
