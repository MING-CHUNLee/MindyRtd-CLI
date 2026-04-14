# CLI Command Regrouping Plan

*Recorded: 2026-04-14*

## Problem

Currently [cli/src/index.ts](cli/src/index.ts) registers 9 top-level Commander
commands plus the TUI default action. Several of these are not conceptually
peer-level to `agent` / `ask`:

- `scan`, `library`, `context` — read-only R project inspection; already exist
  as agent tools, so the CLI registration duplicates surface area.
- `rollback` — operates on agent session state; semantically belongs to the
  agent lifecycle, not a standalone verb.
- `run`, `install` — R execution and package management; cohesive as an
  `r`-scoped utility group rather than bare top-level verbs.

Result: `mindy-cli --help` lists a flat mix of "modes", "resources" and
"one-off utilities" at the same depth, which obscures the mental model
(`agent` / `ask` = primary pipelines; everything else = support).

## Goal

Reduce top-level commands to only those that represent a **primary mode** or
an **independently-managed resource**, and nest the rest under semantically
appropriate parent groups.

## Target surface

**Keep top-level**:

| Command | Reason |
|---|---|
| `agent` | Primary pipeline (also TUI entry via adapter) |
| `ask`   | Primary pipeline |
| `knowledge` | User-facing cross-session memory. Manually curated (`add` / `search` / `remove`) during normal work — frequent enough to deserve a top-level verb, similar in role to `git stash`. Injected into agent system prompt via [context-builder.ts](cli/src/application/services/context-builder.ts) `buildRequest()`. |

**Move under `agent`**:

| Old | New |
|---|---|
| `mindy-cli rollback [turn]` | `mindy-cli agent rollback [turn]` |

**Delete from CLI entirely** (remain as agent tools only):

| Command | Why delete |
|---|---|
| `mindy-cli scan`    | Already a `file_scan` agent tool. Reachable via `mindy-cli ask "scan project"` or from inside an agent session. |
| `mindy-cli library` | Already an agent tool. Same access path as above. |
| `mindy-cli context` | Already an agent tool. Same access path as above. |

Nesting them as `agent inspect …` would just wrap a declarative tool in an
imperative CLI shim, inflating surface area without adding capability.
Deleting the CLI registration keeps these modules single-purpose (`ITool`
implementations only) and aligns with Clean Architecture — one exposure
path per concept.

**Move under a new `r` group**:

| Old | New |
|---|---|
| `mindy-cli run`     | `mindy-cli r run` |
| `mindy-cli install` | `mindy-cli r install` |

**Move under a new `config` (or `debug`) group**:

| Old | New |
|---|---|
| `mindy-cli plugins list` | `mindy-cli config plugins list` |
| `mindy-cli plugins dir`  | `mindy-cli config plugins dir`  |

Rationale for moving `plugins`: unlike `knowledge`, the plugin commands are
only used at **install time or for debugging** ("why didn't my plugin
load?"). Plugins themselves live at `~/.mindy/plugins/*.js` and are
auto-discovered by [plugin-loader.ts](cli/src/infrastructure/filesystem/plugin-loader.ts)
on every agent run — the CLI commands are pure introspection
(`list` shows load status, `dir` prints the path). That is a low-frequency
diagnostic surface, not a peer of `agent` / `ask` / `knowledge`, so it
belongs under a nested group.

## Design decisions

1. **Clean break — no backwards-compatibility shims.** This is a research
   CLI with no known downstream scripts / CI depending on the old names.
   Hidden aliases and deprecation warnings would re-pollute
   [index.ts](cli/src/index.ts) and defeat the main goal of this refactor.
   Renames and deletions happen in one commit; the release note carries an
   old→new mapping table.
2. **Delete inspect commands instead of nesting.** `scan` / `library` /
   `context` are already reachable through the agent tool registry. Users
   who want ad-hoc inspection can run `mindy-cli ask "scan project"` or
   trigger the same tools from inside an agent session. A nested CLI form
   (`agent inspect …`) would add surface area without adding capability.
3. **Before deleting, confirm module shape.** Verify that
   [scan.ts](cli/src/application/controllers/scan.ts),
   [library.ts](cli/src/application/controllers/library.ts),
   [context.ts](cli/src/application/controllers/context.ts) are thin CLI
   wrappers around logic that already lives in the corresponding agent
   tools. If any of them still owns the core logic, the core must be
   relocated into its tool counterpart *before* the CLI registration is
   removed — otherwise deleting the CLI registration would also delete the
   implementation the agent depends on.

### Remaining open question

- **Help-text grouping.** Commander does not natively group subcommands in
  `--help` output. May need custom help formatting so the new `agent` /
  `r` / `config` groupings read cleanly. Defer until after the structural
  move — cosmetic, not blocking.

## Implementation steps

1. **Audit** [scan.ts](cli/src/application/controllers/scan.ts),
   [library.ts](cli/src/application/controllers/library.ts),
   [context.ts](cli/src/application/controllers/context.ts). Confirm each
   is a thin wrapper over its agent tool; if not, move the core logic into
   the tool first (decision 3).
2. **Delete CLI wiring for inspect commands.** Remove the `scanCommand` /
   `libraryCommand` / `contextCommand` imports and `addCommand` calls from
   [index.ts](cli/src/index.ts). Delete the three controller files if they
   are now empty; otherwise trim them down.
3. **Add `rollback` as a subcommand of `agent`.** Extend
   [agent-cli-adapter.ts](cli/src/presentation/cli/agent-cli-adapter.ts)
   with `.command('rollback …')` wired to the existing
   [rollback.ts](cli/src/application/controllers/rollback.ts) handler.
   Delete the top-level `rollbackCommand` registration.
4. **Create the `r` command group.** New file
   `presentation/cli/r-cli-adapter.ts` that exports an `rCommand`
   composing [run.ts](cli/src/application/controllers/run.ts) and
   [install.ts](cli/src/application/controllers/install.ts) as
   subcommands. Register `rCommand` in [index.ts](cli/src/index.ts);
   remove the two top-level registrations.
5. **Create the `config` command group.** New file
   `presentation/cli/config-cli-adapter.ts` that exports a `configCommand`
   with `plugins list` / `plugins dir` as nested subcommands, wired to the
   existing [plugins.ts](cli/src/application/controllers/plugins.ts)
   handlers. Remove the top-level `pluginsCommand` registration.
6. **Update docs**: [CLAUDE.md](CLAUDE.md) command examples, any README
   snippets, TUI slash-command help, and controller JSDoc headers that
   reference the old indicative names (e.g. `mindy knowledge add`
   examples inside the controllers are fine — those still work).
7. **Tests**: add smoke tests that invoke the new command paths
   (`mindy-cli agent rollback`, `mindy-cli r run`,
   `mindy-cli config plugins list`) via Commander's `parseAsync` and
   assert dispatch to the right controller. Remove any test that
   exercised a now-deleted top-level name.
8. **Release note**: write a short `BREAKING CHANGES` section with the
   old→new mapping table for the next version bump.

## Out of scope

- Changing the behaviour of any controller — this is a surface-level
  regrouping only.
- Touching the TUI default action.
- Restructuring [application/controllers/](cli/src/application/controllers/)
  on disk. The files stay where they are; only the wiring in
  [index.ts](cli/src/index.ts) and the CLI adapters change.

## Related

- [2026-04-13_prior_research_comparison.md](../feature_comparison_and_planning/2026-04-13_prior_research_comparison.md) —
  unrelated in topic but also discusses CLI surface shape.
- [2026-04-09-architecture-naming-refactor.md](../2026-04-09-architecture-naming-refactor.md)
