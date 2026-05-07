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
    AgentService,
    type AgentEvent,
    type ProposedEdit,
    type ProposedInstall,
} from '../application/services/agent-service';

import {
    buildAgentDeps,
} from '../infrastructure/bootstrap/agent-factory';

export interface CreateAgentControllerArgs {
    directory: string;
    viewAdapter: (event: AgentEvent) => void;
    approvalGate: (edit: ProposedEdit) => Promise<boolean>;
    installApprovalGate?: (plan: ProposedInstall) => Promise<boolean>;
    /** Resolved absolute path to an assignment directory — activates tutor-guide mode with assignment-specific policy. */
    assignmentDir?: string;
}

export function createAgentController(args: CreateAgentControllerArgs): AgentService {
    return new AgentService(
        { directory: args.directory },
        args.viewAdapter,
        buildAgentDeps(args.directory, args.approvalGate, args.installApprovalGate, args.assignmentDir),
    );
}
