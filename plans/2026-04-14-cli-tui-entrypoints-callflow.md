# 2026-04-14 — CLI / TUI entrypoints & presentation call-flow

## Goal

Clarify:

- Who calls `presentation/cli/agent-cli-adapter.ts`
- Where `tui/event-mapper.ts` is used
- How `views/` and `view-models/` fit in
- Where the **composition root** actually is

This note captures the current wiring as implemented in the repo.

---

## Big picture

There are two primary runtime paths:

1. **One-shot CLI commands** (Commander)
   - `mindy-cli agent "..."` → agent pipeline (edit/run/etc)
   - `mindy-cli ask "..."`   → ask pipeline

2. **Interactive TUI** (Ink)
   - `mindy-cli` (no subcommand) → spawns TUI REPL

Both paths ultimately construct the same `AgentController`, but they differ in:

- how events are rendered (console vs Ink)
- how approvals are collected (readline prompt vs TUI review screen)
- which presentation modules are involved (`tui/event-mapper.ts` is TUI-only)

---

## Call-flow (Mermaid)

Draw.io version: [plans/2026-04-14-cli-tui-entrypoints-callflow.drawio](plans/2026-04-14-cli-tui-entrypoints-callflow.drawio)

```mermaid
flowchart TD
  %% ─────────────────────────────────────────────────────────────
  %% Entry
  %% ─────────────────────────────────────────────────────────────
  A[cli/src/index.ts
  Commander entrypoint]

  %% One-shot CLI path
  A -->|program.addCommand(agent)| B[cli/src/presentation/cli/agent-cli-adapter.ts
  createAgentCommand()
  executeAgentCommand()]
  A -->|program.addCommand(ask)| B2[cli/src/presentation/cli/ask-cli-adapter.ts
  createAskCommand()]

  %% TUI path
  A -->|program.action()| C[launchTUI(): spawn tsx]
  C --> D[cli/src/presentation/tui/index.tsx
  startTUI()]
  D --> E[cli/src/presentation/tui/App.tsx
  Ink UI]

  %% Controller creation (shared)
  B -->|deps.createController(...)| F[cli/src/composition/create-agent-controller.ts
  createAgentController()]
  B2 -->|deps.createController(...)| F
  E -->|dynamic import + createAgentController(...)| F

  %% Composition root for infra deps
  F --> G[cli/src/infrastructure/bootstrap/agent-factory.ts
  buildAgentDeps()]
  F --> H[cli/src/application/controllers/agent-controller.ts
  new AgentController(...)]
  G --> H

  %% Presentation mapping
  A -->|preAction hook| V0[cli/src/presentation/views/banner.ts
  displayBanner()]

  B -->|after executeInstruction| V1[cli/src/presentation/views/context-status-bar.ts
  displayStatusBar(vm, config)]
  V1 <-->|VM + config types| VM[cli/src/presentation/view-models/index.ts]

  %% TUI event mapping
  E --> M[cli/src/presentation/tui/event-mapper.ts
  mapAgentEventToMessage(event)]
  M <-->|reads VMs for rich tool outputs| VM

  %% Notes
  classDef entry fill:#eef,stroke:#99f;
  class A entry;
```

---

## What calls what (key answers)

### Who calls `presentation/cli/agent-cli-adapter.ts`?

- `cli/src/index.ts` calls `createAgentCommand(...)` and registers it with Commander.
- When users run `mindy-cli agent "..."`, Commander calls the `.action(...)` handler defined in `agent-cli-adapter.ts`.

So the immediate caller is **Commander**, configured by **`cli/src/index.ts`**.

### Where is `tui/event-mapper.ts` called?

- `tui/event-mapper.ts` is imported and called by `cli/src/presentation/tui/App.tsx`.
- It is **not used** by one-shot CLI (`agent-cli-adapter.ts`).

### What are `views/` and `view-models/` doing here?

- `view-models/` defines flat presentation DTO types (e.g. `StatusBarVM`, `ScanResultVM`).
- `views/` contains console-oriented formatters + display wrappers (e.g. `displayStatusBar`).

Usage split:

- One-shot CLI uses `views/` for console output (banner, status bar).
- TUI uses `tui/event-mapper.ts` + Ink components; it reads `view-models/` for rendering structured tool outputs.

### Where is the composition root?

There are two levels of composition:

1. **Controller factory boundary (composition module)**
   - `cli/src/composition/create-agent-controller.ts`
   - Purpose: keep `presentation/` and `application/` from importing `infrastructure/`.

2. **Infrastructure wiring boundary (deps factory)**
   - `cli/src/infrastructure/bootstrap/agent-factory.ts`
   - Purpose: instantiate concrete gateways, tools, repos, use-cases, and return `AgentControllerDeps`.

So if you ask “where do real concretions get created?”, that is `buildAgentDeps()`.

---

## Practical mental model

- One-shot CLI = `index.ts` → CLI adapter → create controller → run → console output
- TUI = `index.ts` → spawn Ink app → create controller → run → event-mapper → React state

`event-mapper.ts` is a **pure mapping module** for TUI only.
`views/` is a **console-oriented presentation** module for CLI only.
Both share `view-models/` as the stable DTO boundary.
