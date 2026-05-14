# CLI Presentation Layer: Naming & Layering Alignment

**Date:** 2026-04-21  
**Scope:** `cli/src/cli/presentation/`  
**Status:** Draft — pending decision

---

## Problem

Four files in the same folder serve the same conceptual role — "bridge Commander CLI → Application" — but have inconsistent names and inconsistent architecture:

| File | Name used | Has controller? | Direct infra/domain import? |
|------|-----------|-----------------|------------------------------|
| `agent-cli-presenter.ts` | Presenter | ✅ `CliAgentController` | ✗ |
| `ask-cli-presenter.ts` | Presenter (docstring says Adapter) | ✗ (is its own controller) | ✗ (DI via factory) |
| `knowledge-cli-adapter.ts` | Adapter | ✗ (is its own controller) | ✅ `KnowledgeEntry` (domain entity) |
| `rollback-cli-adapter.ts` | Adapter | ✗ (is its own controller) | ✅ `SessionRepository` (infra), `ConversationSession` (domain) |

Two problems are entangled:

1. **Naming**: "Presenter" vs "Adapter" — two names for the same role.
2. **Layering**: `knowledge` and `rollback` bypass DI and directly `new` infra/domain objects, violating Clean Architecture.

---

## Terminology Decision

In this project's Hexagonal + Clean Architecture:

- **Adapter** (driving side) = anything that translates an external input (CLI, HTTP, TUI key-press) into an Application-layer call.  
- **Presenter** = in MVP, the view-logic holder. Not a pattern this project uses explicitly.

**Decision: standardize on "Adapter".** All four files adapt the same external input (Commander CLI) to the application layer.

Rename:
- `agent-cli-presenter.ts` → `agent-cli-adapter.ts`
- `ask-cli-presenter.ts` → `ask-cli-adapter.ts`
- All exported types/interfaces updated accordingly (e.g. `AgentCliPresenterDeps` → `AgentCliAdapterDeps`)

---

## Layering Options

### Option A — Extract controllers for `knowledge` and `rollback`

Create `cli/controller/cli-knowledge-controller.ts` and `cli/controller/cli-rollback-controller.ts`, mirroring the `agent` pattern.

- ✅ Uniform: all adapters become thin wiring shells.
- ✅ Adapters never import domain or infra.
- ❌ 2 new files for commands that are simple CRUD + no async complexity.
- ❌ Indirection without benefit for `rollback` (one use case, ~30 lines of logic).

### Option B — "Fat adapter" with DI fix (recommended)

Accept that simple commands don't need a separate controller, but enforce the rule: **adapters may call application services directly; they must NOT import domain entities or infrastructure classes.**

Specific fixes:

**`knowledge-cli-adapter.ts`:**
- Remove `import { KnowledgeEntry } from '../../domain/entities/knowledge-entry'`
- Move entity construction into `KnowledgeService.add(title, content, tags, source, projectDir)` — service owns domain construction
- Adapter calls `service.add(title, content, tags, ...)` and receives back a plain `{ id, title }` result

**`rollback-cli-adapter.ts`:**
- Remove `new SessionRepository()` (direct infra construction)
- Add `RollbackCliAdapterDeps { repo: SessionRepository }` and inject via composition root
- Composition root (`cli/composition-root.ts`) provides the `repo` instance

**`ask-cli-presenter.ts` (→ `ask-cli-adapter.ts`):**
- Already uses DI factory `createController` — no structural change needed, only rename.

- ✅ No new files
- ✅ Composition root controls all infra construction
- ✅ Domain logic stays in domain/service layer
- ⚠️ `KnowledgeService.add()` signature change (but internal only — no callers in infra)

### Option C — Rename only, defer architecture fix

Rename files to "adapter" and add a TODO comment on the clean arch violations.

- ✅ Zero risk
- ❌ The `rollback` `new SessionRepository()` is an actual leak — not just a style issue

---

## Recommendation

**Option B** — rename + DI fix. The `rollback` direct `new SessionRepository()` is an untestable hard-dependency; fixing it costs ~10 lines. The `knowledge` domain entity construction belongs in the service. Both fixes are small and make the whole layer consistent.

### Resulting structure

```
cli/src/cli/presentation/
├── agent-cli-adapter.ts       # buildViewAdapter, buildApprovalGate, createAgentCommand
├── ask-cli-adapter.ts         # createAskCommand, executeAskCommand, handleEvent
├── knowledge-cli-adapter.ts   # createKnowledgeCommand — DI: { service }
├── rollback-cli-adapter.ts    # createRollbackCommand — DI: { repo }
└── views/
    ├── context-status-bar.ts
    ├── library-result.ts
    └── scan-result.ts
```

All four files:
- Named `*-cli-adapter.ts`
- Receive dependencies via `*Deps` interface
- Import only from `application/` and `shared/`
- No `new InfraClass()` inside the file

---

## Work Items

1. Rename `agent-cli-presenter.ts` → `agent-cli-adapter.ts`; rename exported `AgentCliPresenterDeps` → `AgentCliAdapterDeps`; update all import sites
2. Rename `ask-cli-presenter.ts` → `ask-cli-adapter.ts`; rename `AskCliAdapterDeps` (docstring already uses this) — type name already correct
3. `knowledge-cli-adapter.ts`: move `KnowledgeEntry.create(...)` into `KnowledgeService.add(title, content, tags, source?, projectDir?)` returning `{ id: string; title: string }`
4. `rollback-cli-adapter.ts`: add `RollbackCliAdapterDeps { repo: SessionRepository }`; remove internal `new SessionRepository()`; update composition root to inject
5. Update import sites for renamed files (`cli/src/index.ts` and any other importers)
6. `bun run build` + `bun run test`
