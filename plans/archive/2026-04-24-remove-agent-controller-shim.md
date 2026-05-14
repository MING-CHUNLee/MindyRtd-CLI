# Plan: Remove `agent-controller.ts` shim

**Goal**: Delete the backward-compat barrel `application/controllers/agent-controller.ts`, update all 6 callers to import directly from `application/services/agent-service`, and remove the `AgentController` / `AgentControllerDeps` / `AgentControllerOptions` aliases from `agent-service.ts`.

---

## Background

`agent-controller.ts` was created when `AgentController` was renamed to `AgentService`. It is a pure re-export shim — no logic of its own. `agent-service.ts` already exports the same aliases at lines 403–407, so the shim adds nothing except an extra indirection layer and a misleading `controllers/` location for what is actually an Application Service.

---

## Files to change

### 1. `application/services/agent-service.ts`

Remove the backward-compat block at the bottom (lines 403–407):

```ts
// DELETE these lines:
// ── Backward-compat re-exports ────────────────────────────────────────────────
export { AgentService as AgentController };
export type { AgentServiceOptions as AgentControllerOptions };
export type { AgentServiceDeps as AgentControllerDeps };
```

### 2. `composition/create-agent-controller.ts`

- Change import source from `../application/controllers/agent-controller` → `../application/services/agent-service`
- Replace the `AgentController` alias with `AgentService` everywhere (type annotation + `new AgentController(...)`)

**Before:**
```ts
import {
    AgentController,
    type AgentEvent,
    type ProposedEdit,
    type ProposedInstall,
} from '../application/controllers/agent-controller';

export function createAgentController(args: CreateAgentControllerArgs): AgentController {
    return new AgentController(
        { directory: args.directory },
        args.viewAdapter,
        buildAgentDeps(...),
    );
}
```

**After:**
```ts
import {
    AgentService,
    type AgentEvent,
    type ProposedEdit,
    type ProposedInstall,
} from '../application/services/agent-service';

export function createAgentController(args: CreateAgentControllerArgs): AgentService {
    return new AgentService(
        { directory: args.directory },
        args.viewAdapter,
        buildAgentDeps(...),
    );
}
```

### 3. `cli/presentation/ask-cli-presenter.ts`

- Change import source → `../../application/services/agent-service`
- Replace `AgentController` type with `AgentService`

**Before:**
```ts
import type { AgentController, AgentEvent } from '../../application/controllers/agent-controller';

export interface AskCliAdapterDeps {
    createController: (args: {
        directory: string;
        viewAdapter: (event: AgentEvent) => void;
    }) => AgentController;
```

**After:**
```ts
import type { AgentService, AgentEvent } from '../../application/services/agent-service';

export interface AskCliAdapterDeps {
    createController: (args: {
        directory: string;
        viewAdapter: (event: AgentEvent) => void;
    }) => AgentService;
```

### 4. `cli/controller/cli-agent-controller.ts`

Only the import path changes — no type aliases used here.

**Before:**
```ts
import type { AgentEvent, ProposedEdit, ProposedInstall, EventCallback, ApprovalCallback, InstallApprovalCallback } from '../../application/controllers/agent-controller';
```

**After:**
```ts
import type { AgentEvent, ProposedEdit, ProposedInstall, EventCallback, ApprovalCallback, InstallApprovalCallback } from '../../application/services/agent-service';
```

### 5. `infrastructure/bootstrap/agent-factory.ts`

- Change import source → `../../application/services/agent-service`
- Replace `AgentControllerDeps` with `AgentServiceDeps`

**Before:**
```ts
import type {
    AgentControllerDeps,
    ApprovalCallback,
    InstallApprovalCallback,
} from '../../application/controllers/agent-controller';

export function buildAgentDeps(...): AgentControllerDeps {
```

**After:**
```ts
import type {
    AgentServiceDeps,
    ApprovalCallback,
    InstallApprovalCallback,
} from '../../application/services/agent-service';

export function buildAgentDeps(...): AgentServiceDeps {
```

Also update the JSDoc in the file header: change "AgentControllerDeps object" → "AgentServiceDeps object".

### 6. `tui/controller/AppController.tsx`

Only the import path changes (`.js` extension preserved for ESM):

**Before:**
```ts
import type { ProposedInstall } from '../../application/controllers/agent-controller.js';
```

**After:**
```ts
import type { ProposedInstall } from '../../application/services/agent-service.js';
```

### 7. `tui/presentation/event-mapper.ts`

Only the import path changes (`.js` extension preserved):

**Before:**
```ts
import type { AgentEvent, ProposedEdit } from '../../application/controllers/agent-controller.js';
```

**After:**
```ts
import type { AgentEvent, ProposedEdit } from '../../application/services/agent-service.js';
```

### 8. Delete `application/controllers/agent-controller.ts`

After all callers are updated, delete the shim file.

---

## Execution order

1. Update `agent-service.ts` — remove aliases block
2. Update the 6 caller files (steps 2–7 above) — can be done in parallel
3. Delete `agent-controller.ts`
4. Run `bun run build` to confirm zero TypeScript errors
5. Run `bun run test` to confirm all tests pass

---

## Scope boundaries

- **Do not rename** `create-agent-controller.ts` or `createAgentController()` — the factory function name is correct; it describes what it builds from the caller's perspective.
- **Do not rename** `CliAgentController` — that is a different class in `cli/controller/`, not the shim.
- No logic changes — pure import/type-name cleanup only.
