/**
 * Backward-compat re-export barrel.
 *
 * The canonical implementation lives in application/services/agent-service.ts.
 * This file re-exports everything under the old names so existing callers
 * continue to compile without changes.
 */
export {
    AgentService,
    AgentService as AgentController,
    type AgentEvent,
    type AgentEventType,
    type ProposedEdit,
    type ProposedInstall,
    type ApprovalCallback,
    type InstallApprovalCallback,
    type EventCallback,
    type AgentServiceOptions,
    type AgentServiceOptions as AgentControllerOptions,
    type AgentServiceDeps,
    type AgentServiceDeps as AgentControllerDeps,
    type IPluginLoader,
} from '../services/agent-service';
