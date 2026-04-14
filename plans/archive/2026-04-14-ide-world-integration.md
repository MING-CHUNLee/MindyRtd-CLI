# IDE World Integration & Controller Cleanup Plan

*Recorded: 2026-04-14*
*Supersedes: [2026-04-14-cli-command-regrouping.md](archive/2026-04-14-cli-command-regrouping.md)*

---

## Problem

The previous regrouping plan proposed moving `run.ts`, `install.ts`, `plugins.ts`
under new CLI groups (`r`, `config`). After deeper analysis of the actual workflows:

- `run.ts` is not just a utility — it wraps RBridge's **"current file in RStudio"**
  capability, which has no equivalent in the agent tool layer. The right fix is
  to lift this capability *into* the agent rather than expose it as a nested CLI verb.
- `install.ts` duplicates what `ExecuteInstallUseCase` + `r-install-tool` already
  implement (agent-driven, whitelist-guarded, approval-gated). The CLI variant is
  purely redundant.
- `plugins.ts` is low-frequency diagnostic tooling; no agent or user workflow
  depends on it being a CLI command.
- `rollback.ts` has a TUI-side sibling (`/rollback` slash command) that should be
  made equally powerful, reducing the need for an external CLI invocation.

---

## Goal

1. **Absorb the "IDE world" into the agent** — when the user interacts with the
   agent (TUI or `mindy agent`), the agent is aware of which file is currently open
   in RStudio and routes run requests accordingly.
2. **Delete controllers that are now redundant** — `run.ts`, `install.ts`,
   `plugins.ts`.
3. **Simplify `rollback.ts`** and compensate by making `/rollback` in the TUI as
   capable as the CLI version.
4. **No behaviour changes** for `agent`, `ask`, `knowledge` — this is a
   surface/routing refactor only.

---

## Key Architectural Constraint: RBridge Has No `getCurrentFile()`

RBridge communicates via file-based IPC (`pending.json` → `result.json`).
It currently supports only **execute** actions:
`run_current`, `run_code`, `run_file`, `render_rmd`, `install_packages`.

There is **no way to query "what file is open in RStudio"** without adding a new
action and a corresponding handler in the R listener.

This is the one non-trivial infrastructure change required.

---

## Design Decisions

### 1. Add `get_current_file` to RBridge + R listener

Add a new action to the file-based IPC protocol:

```
Node → pending.json: { action: "get_current_file", id: "...", ... }
R    ← result.json:  { id: "...", status: "completed", filePath: "C:/.../hw5.Rmd" }
```

R implementation (inside the listener's switch):
```r
case "get_current_file":
  ctx <- rstudioapi::getActiveDocumentContext()
  list(id = cmd$id, status = "completed", filePath = ctx$path)
```

This is the minimal R-side change: one `case` branch — no new dependencies.

### 2. Upgrade `ExecuteRunUseCase` to be RBridge-aware

New routing logic inside the use case:

```
Step 1 │ Is RBridge listener running?
       │  No  → existing r_exec pipeline (directory scan)
       │  Yes ↓

Step 2 │ getCurrentFile() → activeFilePath

Step 3 │ Does the instruction mention a specific filename?
       │  No  (generic: "run", "跑一下", "execute")
       │       → RBridge.runCurrentFile()  ← user is editing this file
       │
       │  Yes, matches activeFilePath
       │       → RBridge.runCurrentFile()  ← same file, use faster path
       │
       │  Yes, different file
       │       → r_exec pipeline on the mentioned file
       │         (RBridge not used — user explicitly named something else)

Step 4 │ Stream LLM analysis regardless of execution path
       │ (script source + data previews + execution output)
```

### 3. Add `/run` to SlashCommandRouter (quick path, no LLM)

```
/run
  ├─ RBridge running → runCurrentFile() → print raw output
  └─ not running    → "請先在 RStudio 執行 mindy::start()"
```

This is the TUI equivalent of the old `mindy r run` — instant, no reasoning.

### 4. Enhance `/rollback` to match CLI capability

Extended grammar:

| Command | Behaviour |
|---|---|
| `/rollback list` | List all turns in current session (timestamp + preview) |
| `/rollback <n>` | Roll back to after turn n (existing) |
| `/rollback session list` | List recent sessions (id + turnCount + date) |
| `/rollback session <id> <n>` | Cross-session rollback — load, rollback, save |

The two-step UX (`/rollback list` → read output → `/rollback 2`) replaces
the readline confirmation prompt from `rollback.ts`. It is safer: the user sees
the full list before committing.

### 5. Simplify `rollback.ts` CLI controller

Keep only the non-interactive path needed for scripting / pre-TUI cleanup:
- `mindy agent rollback <n>` — rollback without prompts
- `mindy agent rollback --list` — print turn list and exit

Remove: readline interactive picker, readline confirm prompt.
The TUI's `/rollback` covers both.

### 6. Delete `run.ts`, `install.ts`, `plugins.ts`

| Controller | Replacement |
|---|---|
| `run.ts` | `ExecuteRunUseCase` (RBridge-aware) + `/run` slash command |
| `install.ts` | `ExecuteInstallUseCase` + `r-install-tool` (already complete) |
| `plugins.ts` | None needed — agent auto-loads plugins on startup |

### 7. `install.ts` → Rscript path confirmed

`r-install-tool` uses `execRscriptCode` (system Rscript).
This is the correct path: packages installed via Rscript are available in RStudio
under the same library path in standard setups.
The `PackageValidator` inside `r-install-tool` is the whitelist.
No changes needed to the install pipeline.

---

## Implementation Steps

### Phase 1 — R listener (R package side)

1. **Add `get_current_file` handler** in the R listener switch statement.
   - Use `rstudioapi::getActiveDocumentContext()$path`.
   - Return empty string if no file is open (unsaved buffer).
   - Guard with `rstudioapi::isAvailable()` check.

### Phase 2 — Node: RBridge

2. **Add `getCurrentFile()` method to `RBridge`**
   (`cli/src/infrastructure/r-adapter/r-bridge.ts`).
   - New action: `get_current_file`.
   - Returns `string | null` (null if not available or empty path).
   - Should NOT throw if RStudio returns an empty path — return null instead.

### Phase 3 — Node: ExecuteRunUseCase

3. **Inject `RBridge` dependency** into `ExecuteRunUseCaseDeps`.
   - Keep it optional/nullable so tests and non-RStudio environments continue to work.
4. **Implement the routing logic** described in Decision 2.
   - New private method `resolveExecutionPath(instruction, bridge)`:
     returns `{ mode: 'bridge_current' | 'bridge_file' | 'rscript', filePath?: string }`.
   - `runScript()` switches on `mode`.

### Phase 4 — Node: SlashCommandRouter

5. **Add `/run` command** — calls `RBridge.runCurrentFile()`, formats output as text.
   - Needs `RBridge` added to `SlashCommandContext`.
6. **Enhance `/rollback`**:
   - `/rollback list` → format turns as numbered list.
   - `/rollback session list` → load session index from repo, format as list.
   - `/rollback session <id> <n>` → cross-session rollback.

### Phase 5 — Controller cleanup

7. **Delete `run.ts`** — remove import and `addCommand` from `index.ts` and any adapter.
8. **Delete `install.ts`** — same.
9. **Delete `plugins.ts`** — same.
10. **Simplify `rollback.ts`** — strip readline interactive mode, keep `<n>` and `--list`.

### Phase 6 — agent-factory wiring

11. **Wire `RBridge` into `ExecuteRunUseCaseDeps`** inside `agent-factory.ts`.
12. **Wire `RBridge` into `SlashCommandContext`** for the new `/run` command.

### Phase 7 — Tests & docs

13. **Unit tests** for the new routing logic in `ExecuteRunUseCase` (mock RBridge).
14. **Slash command tests** — `/run` (bridge available / not available), `/rollback list`,
    `/rollback session list`, `/rollback session <id> <n>`.
15. **Update `CLAUDE.md`** — remove `mindy r run`, `mindy r install`, `mindy plugins *`
    examples; add `/run`, new `/rollback` grammar.

---

## Files Changed

### New / modified (Node)

| File | Change |
|---|---|
| `infrastructure/r-adapter/r-bridge.ts` | Add `getCurrentFile(): Promise<string \| null>` |
| `application/use-cases/execute-run-use-case.ts` | RBridge-aware routing, inject `RBridge` dep |
| `application/services/slash-command-router.ts` | Add `/run`; enhance `/rollback` |
| `application/controllers/rollback.ts` | Strip readline; keep `<n>` + `--list` only |
| `presentation/cli/agent-cli-adapter.ts` | Mount simplified `rollbackCommand` as subcommand |
| `infrastructure/bootstrap/agent-factory.ts` | Wire `RBridge` into run use case + slash context |
| `index.ts` | Remove `runCommand`, `installCommand`, `pluginsCommand` imports + addCommand |

### Deleted (Node)

| File | Reason |
|---|---|
| `application/controllers/run.ts` | Replaced by enhanced use case + `/run` |
| `application/controllers/install.ts` | Replaced by existing `ExecuteInstallUseCase` |
| `application/controllers/plugins.ts` | No longer needed as CLI command |

### Modified (R package)

| Location | Change |
|---|---|
| R listener switch statement | Add `"get_current_file"` case |

---

## Out of Scope

- Changing the R install path (Rscript confirmed, not RBridge).
- Modifying `ExecuteInstallUseCase` or `r-install-tool` — already correct.
- Touching `agent`, `ask`, `knowledge` command behaviour.
- Restructuring the `application/controllers/` folder on disk (except deletions).
- Commander help-text grouping cosmetics (deferred per earlier plan).

---

## Verification Plan

- `mindy agent "run my script"` → RBridge path taken when RStudio is open.
- `mindy agent "run hw5.Rmd"` → routes to RBridge if `hw5.Rmd` is the active file;
  r_exec pipeline if it's a different file.
- `/run` in TUI → executes current file immediately, no LLM.
- `/rollback list` in TUI → shows numbered turns.
- `/rollback session list` → shows recent sessions.
- `/rollback session <id> <n>` → mutates target session correctly.
- `mindy agent rollback 2 --list` (CLI) → prints turns without readline prompt.
- `mindy r run`, `mindy r install`, `mindy plugins list` → command not found
  (confirms deletion).
