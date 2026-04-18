# Knowledge CLI Adapter — DI Fix Plan

*Recorded: 2026-04-18*

## Problem

[knowledge-cli-adapter.ts](cli/src/presentation/cli/knowledge-cli-adapter.ts) violates
two Clean Architecture rules that the other CLI adapters follow:

**Violation 1 — presentation imports infrastructure directly**

```ts
// line 11
import { KnowledgeRepository } from '../../infrastructure/persistence/knowledge-repository';
```

The dependency rule states that outer layers may only depend on layers inward
(`presentation → application → domain`). `presentation → infrastructure` is a
cross-layer shortcut not present in any other adapter.

**Violation 2 — self-instantiation instead of DI**

```ts
// line 15
const repo = new KnowledgeRepository();   // module-level, not injected
```

The composition root ([index.ts](cli/src/index.ts)) is responsible for wiring
infrastructure objects and passing them in. Having the adapter `new` its own
dependency makes it impossible to swap implementations or test the adapter
in isolation — exactly the problem DI is designed to solve.

Compare with the agent adapter's explicit contract:
> *"Strict clean: no imports from infrastructure/ — controller is injected via composition root"*

## Goal

Align `knowledge-cli-adapter` with the DI pattern used by
[agent-cli-adapter.ts](cli/src/presentation/cli/agent-cli-adapter.ts) and
[ask-cli-adapter.ts](cli/src/presentation/cli/ask-cli-adapter.ts):

- Adapter accepts a `deps` object with the infrastructure dependency injected.
- Adapter has zero imports from `infrastructure/`.
- Composition root (`index.ts`) owns the `new KnowledgeRepository()` call.

## Design decisions

1. **Inject `KnowledgeRepository` directly (not an interface).** The repository
   is a thin persistence class with no existing interface counterpart. Introducing
   `IKnowledgeRepository` would be correct long-term but is out of scope here.
   The adapter can type-hint against the concrete class for now; the DI boundary
   is the important fix.
2. **Export a factory function, not a pre-built Command.** The current export is
   `export const knowledgeCommand = new Command(...)` — a module-level singleton
   that forces the self-instantiation in violation 2. Switching to
   `export function createKnowledgeCommand(deps)` mirrors the other adapters
   and enables DI.
3. **No behaviour change.** All four subcommands (`add`, `list`, `search`,
   `remove`) keep identical logic; only the instantiation site moves.

## Target API

```ts
// knowledge-cli-adapter.ts
export interface KnowledgeCliAdapterDeps {
    repo: KnowledgeRepository;
}

export function createKnowledgeCommand(deps: KnowledgeCliAdapterDeps): Command {
    const cmd = new Command('knowledge')
        .description('Manage the agent knowledge base (cross-session memory)');
    // ... subcommands use deps.repo instead of module-level repo
    return cmd;
}
```

```ts
// index.ts (composition root)
import { createKnowledgeCommand } from './presentation/cli/knowledge-cli-adapter';
import { KnowledgeRepository } from './infrastructure/persistence/knowledge-repository';

const knowledgeCommand = createKnowledgeCommand({
    repo: new KnowledgeRepository(),
});
program.addCommand(knowledgeCommand);
```

## Implementation steps

1. **Refactor `knowledge-cli-adapter.ts`**
   - Change the export from `export const knowledgeCommand` (module-level
     singleton) to `export function createKnowledgeCommand(deps: KnowledgeCliAdapterDeps): Command`.
   - Remove the top-level `const repo = new KnowledgeRepository()` and the
     `import { KnowledgeRepository }` from infrastructure.
   - Add `KnowledgeCliAdapterDeps` interface (field: `repo: KnowledgeRepository`).
   - Thread `deps.repo` into all four subcommand action handlers in place of
     the module-level `repo`.
   - `KnowledgeBase` is still constructed locally inside the `search` action
     (`new KnowledgeBase()` + `kb.load(...)`) — this is application-layer and
     does not require injection; leave it as is.

2. **Update `index.ts`**
   - Import `KnowledgeRepository` from `infrastructure/persistence/knowledge-repository`.
   - Call `createKnowledgeCommand({ repo: new KnowledgeRepository() })` and
     pass the result to `program.addCommand(...)`.
   - Remove the old `import { knowledgeCommand }` named-export import.

3. **Run tests and build**
   ```bash
   cd cli && bun run test
   bun run build
   ```
   Verify no regressions. The `knowledge` subcommand behaviour is unchanged,
   so existing acceptance tests should pass without modification.

4. **Spot-check manually**
   ```bash
   bun run mindy -- knowledge add "test" "some content"
   bun run mindy -- knowledge list
   bun run mindy -- knowledge search "test"
   bun run mindy -- knowledge remove <id>
   ```

## Out of scope

- Introducing `IKnowledgeRepository` interface (worthwhile future refactor,
  not required for the DI fix).
- Changing `KnowledgeBase` instantiation inside the `search` handler — it is
  application-layer and carries no infrastructure dependency.
- Any change to knowledge persistence logic or data format.

## Related

- [agent-cli-adapter.ts](cli/src/presentation/cli/agent-cli-adapter.ts) — reference DI pattern
- [ask-cli-adapter.ts](cli/src/presentation/cli/ask-cli-adapter.ts) — reference DI pattern
- [2026-04-12-composition-root-extraction.md](2026-04-12-composition-root-extraction.md) — prior work establishing composition root pattern
