# Architecture Naming & Responsibility Refactor

> Date: 2026-04-09
> Depends on: `plans/archive/2026-04-09-agent-service-role-analysis.md`
> Scope: `cli/src/application/` + `cli/src/presentation/`

## Goal

Fix the four structural deficiencies identified in the role analysis, so that
folder names, class names, and actual responsibilities are all aligned with
Clean Architecture and the SKILL.md contract.

---

## Problem Summary

| # | Deficiency | Root Cause |
|---|---|---|
| 1 | Naming mismatch | `facade/agent-service.ts` IS a Controller; `controllers/agent.ts` IS Presentation |
| 2 | Blurry responsibility | `executeInstall` bypasses use-case; `prepareHistory` leaks summarization into Controller |
| 3 | Presentation code in wrong layer | `chalk`, `ora`, `readline` live in `application/controllers/` |
| 4 | Constructor-injected observer | `onEvent`/`onApproval` injected at construction time — Observer pattern leaked into Controller |

---

## Proposed Solution (Per Issue)

### Issue 1 — Rename to match actual roles

**Current → Target**

```
application/facade/agent-service.ts      →  application/controllers/agent-controller.ts
application/controllers/agent.ts         →  presentation/cli/agent-cli-adapter.ts
application/facade/  (folder)            →  deleted (move the one file, remove folder)
```

**Why this works:**
- `agent-service.ts` does exactly what SKILL.md defines as Controller: receive input → route to use-case → emit output. Rename to `AgentController`.
- `controllers/agent.ts` does exactly what Presentation does: create View (event handlers with chalk/ora) + launch Controller. Move it to `presentation/cli/`.

**Impact:**
- Update import in `src/index.ts`: `agentCommand` comes from `presentation/cli/agent-cli-adapter.ts` instead of `application/controllers/agent.ts`
- Update any `import ... from '../facade/agent-service'` → `import ... from '../controllers/agent-controller'`
- No behavior change

---

### Issue 2 — Extract `ExecuteInstallUseCase`

**Problem:**  `AgentService.executeInstall()` calls `this.registry.get('r_install')` directly — bypasses the use-case layer and makes the Controller aware of tool internals.

**Fix:** Create `application/use-cases/execute-install-use-case.ts` parallel to the existing use-cases.

```typescript
// execute-install-use-case.ts
export class ExecuteInstallUseCase {
    constructor(private readonly deps: { registry: ToolRegistry; emit: EmitFn }) {}

    async execute(instruction: string): Promise<{ content: string; usage: TurnUsage }> {
        // Extract package names regex already in AgentService.executeInstall()
        // Call r_install tool, return result
    }
}
```

`AgentController.executeInstruction()` then routes `intent === 'install'` the same way as every other intent:

```typescript
if (intent === 'install') {
    return this.executeWithMode(
        instruction,
        () => this.installUseCase.execute(instruction),
        result => result.content,
    );
}
```

**`prepareHistory` note:** This helper is acceptable in the Controller — it translates domain session state into use-case input (a Controller responsibility). The `HistorySummarizer` call inside it is a sub-service delegation, not a violation. No change needed here.

---

### Issue 3 — Move CLI Presentation code to `presentation/cli/`

This is the file-move from Issue 1: `application/controllers/agent.ts` → `presentation/cli/agent-cli-adapter.ts`.

After the move the `presentation/cli/` tree looks like:

```
presentation/
├── cli/
│   └── agent-cli-adapter.ts    ← NEW (moved from controllers/agent.ts)
├── tui/
├── view-models/
├── views/
└── i18n/
```

The adapter's responsibilities remain identical — it is simply in the correct layer now:
- Build `onEvent` handler (chalk, ora, console.log)
- Build `onApproval` handler (readline)
- Instantiate `AgentController` (renamed from AgentService)
- Call `displayStatusBar` after completion

---

### Issue 4 — Observer cleanup (constructor callbacks)

**Option A — EventEmitter (full fix)**

Replace constructor-injected callbacks with `EventEmitter`:

```typescript
// AgentController extends EventEmitter
export class AgentController extends EventEmitter {
    constructor(options: AgentControllerOptions, deps?: AgentControllerDeps) { ... }
    // no onEvent / onApproval in constructor
}

// In agent-cli-adapter.ts
const controller = new AgentController({ directory: options.directory });
controller.on('diff_proposed', (edit) => { /* readline approval */ });
controller.on('text_output', (data) => { /* chalk render */ });
await controller.initialize(...);
await controller.executeInstruction(instruction);
```

**Pros:** Standard Node.js pattern; Controller no longer knows who's listening at construction time.  
**Cons:** `onApproval` is async (requires `await`) — `EventEmitter` doesn't natively support async listeners. Need to either use `emitAsync` or keep `onApproval` as a separate injected callback.

**Option B — Keep callbacks, rename for clarity (minimal fix)**

Keep constructor injection but rename to clarify intent:

```typescript
constructor(
    options: AgentControllerOptions,
    viewAdapter: AgentViewAdapter,   // was: onEvent
    approvalGate: ApprovalCallback,  // was: onApproval
    deps?: AgentControllerDeps,
)
```

Define `AgentViewAdapter = (event: AgentEvent) => void` in a `presentation/` types file, making the layering explicit.

**Recommendation:** Option B for now — lower risk, no behavior change, and it makes the intent clear without fighting `EventEmitter`'s async limitation. Revisit EventEmitter if a second UI adapter (e.g. TUI) is needed in parallel.

---

## Implementation Phases

| Phase | Change | Risk | Files Touched |
|---|---|---|---|
| **P1** | Move `controllers/agent.ts` → `presentation/cli/agent-cli-adapter.ts`; fix import in `index.ts` | Low (pure move) | `presentation/cli/agent-cli-adapter.ts` (new), `application/controllers/agent.ts` (delete), `src/index.ts` |
| **P2** | Rename `facade/agent-service.ts` → `controllers/agent-controller.ts`; rename class `AgentService` → `AgentController`; update all imports | Low-Medium (rename cascade) | `application/controllers/agent-controller.ts` (new), `facade/agent-service.ts` (delete), `presentation/cli/agent-cli-adapter.ts`, tests |
| **P3** | Extract `ExecuteInstallUseCase`; remove `executeInstall` from `AgentController` | Low (behavior preserved) | `application/use-cases/execute-install-use-case.ts` (new), `application/controllers/agent-controller.ts` |
| **P4** | Rename `onEvent`/`onApproval` constructor params to `viewAdapter`/`approvalGate` | Trivial | `application/controllers/agent-controller.ts`, `presentation/cli/agent-cli-adapter.ts` |

Do P1 first (independently verifiable), then P2+P3+P4 in one commit.

---

## Files to Update

### Deleted
- `cli/src/application/facade/agent-service.ts`
- `cli/src/application/controllers/agent.ts`
- `cli/src/application/facade/` (folder, if empty after move)

### Created
- `cli/src/application/controllers/agent-controller.ts` (renamed from facade/agent-service.ts)
- `cli/src/application/use-cases/execute-install-use-case.ts`
- `cli/src/presentation/cli/agent-cli-adapter.ts` (moved from controllers/agent.ts)

### Modified
- `cli/src/index.ts` — update import source for `agentCommand`
- `cli/src/application/controllers/ask.ts`, `run.ts`, etc. — no change needed (they don't import AgentService)
- `cli/tests/agent-service.test.ts` → `cli/tests/agent-controller.test.ts` — rename + update import

---

## Acceptance Criteria

- [ ] `application/facade/` folder no longer exists
- [ ] `presentation/cli/agent-cli-adapter.ts` contains all chalk/ora/readline code
- [ ] `application/controllers/agent-controller.ts` has zero imports of `chalk`, `ora`, `readline`
- [ ] `executeInstall` logic lives in `ExecuteInstallUseCase`, not in `AgentController`
- [ ] All existing tests pass (`bun run test`)
- [ ] `mindy agent "..."` one-shot command works end-to-end

---

## Non-Goals

- Do NOT convert `onApproval` to EventEmitter (async complication, no second UI yet)
- Do NOT rename other controllers (`ask.ts`, `run.ts`, etc.) — they are already correctly named
- Do NOT refactor `prepareHistory` — it is legitimately in the Controller
- Do NOT change any business logic — this is a pure structural refactor
