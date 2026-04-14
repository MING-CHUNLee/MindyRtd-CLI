# Controller / Composition Root Separation

> Date: 2026-04-14
> Scope: `cli/src/application/controllers/agent-controller.ts`
>         `cli/src/infrastructure/bootstrap/agent-factory.ts`

---

## Observation

`AgentController` currently mixes two distinct responsibilities:

### Responsibility A — Controller (correct, should stay)
Route a request to the right use case based on intent, persist the session turn,
and emit events to the view adapter.

```typescript
// This belongs in a controller
const intent = await this.classifyIntent(instruction, history);
if (intent === 'ask') {
    return this.executeWithMode(instruction, () => this.askUseCase.execute(...), ...);
}
```

### Responsibility B — Composition Root (should move to factory)
Construct all use cases from raw infrastructure dependencies received through `deps`.

```typescript
// This does NOT belong in a controller
this.askUseCase = deps.askUseCase ?? new ExecuteAskUseCase({
    llm: this.llm,
    registry: this.registry,
    ...
});
```

Because the controller constructs use cases itself, it must hold raw infrastructure
references (`llm`, `repo`, `diffEngine`, `registry`) as instance fields — and must
import `LLMGateway` from the domain layer.  This violates the contract from
`application/SKILL.md`:

> **Controllers have only one reason to change: the CLI command/route signature.**

Currently `AgentController` also changes when:
1. A use case's constructor signature changes (DI wiring)
2. `llm.getProviderInfo()` is called directly in `initialize()` (skips use-case layer)
3. A new use case is added (requires wiring code inside the controller)

---

## Root Cause

`agent-factory.ts` stops short — it builds raw infrastructure objects but does
**not** assemble the use cases.  The controller fills this gap, making itself a
partial composition root.

```
Current flow:
  agent-factory  →  raw deps (llm, repo, diffEngine, registry)
                          ↓
  AgentController  →  constructs use cases  +  routes requests  ← two jobs

Target flow:
  agent-factory  →  fully assembled use cases
                          ↓
  AgentController  →  routes requests only  ← one job
```

---

## Problem Summary

| # | Symptom | Root cause |
|---|---------|------------|
| 1 | `import { LLMGateway }` in controller | Controller needs raw LLM to wire use cases |
| 2 | `import { SessionStore }` in controller | Controller needs raw repo to wire slash router |
| 3 | `import { DiffEngine }` in controller | Controller needs raw diff engine to wire instruction use case |
| 4 | `this.llm.getProviderInfo()` in `initialize()` | Controller calls domain directly instead of asking a use case |
| 5 | `AgentControllerDeps` exposes raw infra objects | Factory-level concerns leak into application-layer interface |
| 6 | Controller changes when use case constructor changes | Violates single-reason-to-change for controllers |

---

## Proposed Solution

### Step 1 — Move all use-case construction into `agent-factory.ts`

`agent-factory.ts` is the Composition Root.  It already instantiates all
infrastructure concretions.  It should also instantiate all application use cases
and pass them — already wired — to the controller.

**`agent-factory.ts` additions:**
```typescript
const emit = (type: string, data: Record<string, unknown>) => { /* bridged later */ };

const askUseCase         = new ExecuteAskUseCase({ llm, registry, directory, emit });
const instructionUseCase = new ExecuteInstructionUseCase({ llm, registry, diffEngine, directory, onApproval, stagingService, emit });
const runUseCase         = new ExecuteRunUseCase({ llm, registry, directory, emit });
const solverUseCase      = new ExecuteSolverUseCase({ ... });
const tutorSocraticUseCase = new ExecuteTutorUseCase({ ... }, 'socratic');
const tutorGuideUseCase    = new ExecuteTutorUseCase({ ... }, 'guide');
const installUseCase       = new ExecuteInstallUseCase({ ... });
const intentRouter         = new IntentRouter(llm, emit);
const slashRouter          = new SlashCommandRouter({ repo, llm, modeManager, ... });
```

> **Note on `emit`:** Use cases need an emit callback at construction time but the
> callback's target (the view adapter) is only known when the controller is created.
> One clean solution is a late-bound emitter: pass a thin `EventBus` object whose
> `emit` method is a no-op until `bus.bind(viewAdapter)` is called.  The factory
> creates the bus and wires it into all use cases; the controller calls `bus.bind()`
> in its constructor.

### Step 2 — Slim down `AgentControllerDeps`

Remove raw infrastructure fields.  The interface should expose only assembled
application objects:

```typescript
// Before (leaks infra into application interface)
export interface AgentControllerDeps {
    llm: LLMGateway;
    repo: SessionStore;
    diffEngine: DiffEngine;
    registry: ToolRegistry;
    stagingService?: EditStagingService;
    pluginLoader?: IPluginLoader;
    summarizer?: HistorySummarizer;
    // ...optional testability overrides for each use case
}

// After (application-layer concerns only)
export interface AgentControllerDeps {
    askUseCase: ExecuteAskUseCase;
    instructionUseCase: ExecuteInstructionUseCase;
    runUseCase: ExecuteRunUseCase;
    solverUseCase: ExecuteSolverUseCase;
    tutorSocraticUseCase: ExecuteTutorUseCase;
    tutorGuideUseCase: ExecuteTutorUseCase;
    installUseCase: ExecuteInstallUseCase;
    intentRouter: IntentRouter;
    slashRouter: SlashCommandRouter;
    summarizer: HistorySummarizer;
    pluginLoader: IPluginLoader;
    modeManager: ModeManager;
    repo: SessionStore;         // still needed: initialize() loads/saves sessions
    initialModel: string;       // replaces direct llm.getProviderInfo() call
}
```

> `repo` stays because session load/save is a controller responsibility
> (session lifecycle is not a use-case concern here).
> `initialModel` is a plain string provided by the factory so the controller
> never calls `llm.getProviderInfo()` directly.

### Step 3 — Remove raw infra fields from `AgentController`

After Step 2 the controller no longer needs to hold `llm`, `diffEngine`, or
`registry`.  Remove those private fields and remove their imports:

```typescript
// Lines to DELETE from agent-controller.ts
import { LLMGateway }  from '../../domain/types/llm-gateway';
import { DiffEngine }  from '../services/diff-engine';
import { ToolRegistry } from '../orchestration/tool-registry';

private readonly llm: LLMGateway;       // remove
private readonly diffEngine: DiffEngine; // remove
private readonly registry: ToolRegistry; // remove
```

### Step 4 — Replace `llm.getProviderInfo()` call in `initialize()`

```typescript
// Before
const model = this.llm.getProviderInfo().model;

// After
const model = this.initialModel;   // plain string from deps
```

---

## File Change Summary

| File | Change |
|------|--------|
| `infrastructure/bootstrap/agent-factory.ts` | Construct all use cases; create EventBus; expose `initialModel` |
| `application/controllers/agent-controller.ts` | Remove raw infra fields + imports; slim constructor to bind EventBus |
| `application/controllers/agent-controller.ts` | `AgentControllerDeps` — remove infra fields, require assembled use cases |
| `application/services/event-bus.ts` *(new)* | Thin `EventBus` with `bind(cb)` + `emit(type, data)` |

---

## What Does NOT Change

- All use case implementations (`execute-ask-use-case.ts`, etc.) — untouched
- All event types (`AgentEvent`) — untouched
- All approval callbacks — untouched
- Session persistence logic — stays in `AgentController.initialize()` / `executeInstruction()`
- Backward-compat re-exports at the bottom of the file — untouched

---

## Acceptance Criteria

- [ ] `agent-controller.ts` no longer imports `LLMGateway`, `DiffEngine`, or `ToolRegistry`
- [ ] `AgentControllerDeps` contains no raw infrastructure types (except `SessionStore` for session lifecycle)
- [ ] `agent-factory.ts` constructs all use cases before returning `AgentControllerDeps`
- [ ] `AgentController` constructor contains no `new UseCase(...)` calls
- [ ] All existing tests pass (`bun run test`)
- [ ] `bun run build` produces no TypeScript errors
