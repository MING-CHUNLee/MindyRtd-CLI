# Plan: Rename `cli/` → `mindy-cli/`

**Date:** 2026-04-21  
**Branch:** `refactor/rename-cli-to-mindy-cli`  
**Status:** Proposed

## Goal

Rename the `cli/` directory to `mindy-cli/` to better reflect the project name, then verify the build and test suite still pass.

## Feasibility

**Feasible.** The `cli/tsconfig.json` uses only relative paths (`./src`, `./dist`) — no changes needed inside the package. The main cost is updating hard-coded path strings in config and docs.

---

## Step-by-Step Plan

### Step 1 — Create branch

```bash
git checkout -b refactor/rename-cli-to-mindy-cli
```

### Step 2 — Rename the directory

```bash
git mv cli mindy-cli
```

Using `git mv` preserves history.

### Step 3 — Update hard-coded paths (CRITICAL)

| File | What to change |
|------|---------------|
| `CLAUDE.md` | All references: `cd cli` → `cd mindy-cli`, paths `cli/src/` → `mindy-cli/src/`, etc. |
| `.claude/settings.local.json` | Three full Windows paths containing `\\cli\\` → `\\mindy-cli\\` |
| `README.md` | `cd cli` → `cd mindy-cli`, directory tree entry, architecture paths |
| `Rakefile` | Line 85: `cli/.env` → `mindy-cli/.env` |
| `mindy-cli/README.md` (was `cli/README.md`) | `cd cli` → `cd mindy-cli` |

### Step 4 — Check internal import in `index.ts`

Verify line 25 of `mindy-cli/src/index.ts`:

```ts
const { startCLI } = await import('./cli/index');
```

This `./cli/` is an **internal module path** (a subdirectory inside `src/`), not the top-level directory name, so it likely does **not** need changing. Confirm by checking if `mindy-cli/src/cli/` exists as a folder.

### Step 5 — Build

```bash
cd mindy-cli && bun run build
```

Expected: compiles TypeScript → `dist/` with zero errors.

### Step 6 — Run tests

```bash
cd mindy-cli && bun run test
```

Expected: all 119 existing tests pass.

### Step 7 — Smoke-test the built CLI

```bash
node mindy-cli/dist/index.js agent "hello"
```

### Step 8 — Update docs (RECOMMENDED)

Low-priority: update planning files in `plans/` and `.agents/` that reference `cli/`. These are archive/reference only and won't break anything.

### Step 9 — Commit

```bash
git add -A
git commit -m "refactor: rename cli/ to mindy-cli/"
```

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `.claude/settings.local.json` paths missed | Medium | Update all 3 occurrences in Step 3 |
| Shell scripts use `$SCRIPT_DIR` relative logic | Low | `mindy-cli/mindy-cli.sh` uses `$SCRIPT_DIR` (dynamic), unaffected |
| TypeScript path aliases broken | Low | `tsconfig.json` uses `./src` relative — unaffected |
| Test fixtures hardcode `cli/` | Low | Check test files for any `cli/` string literals before committing |

---

## Files NOT requiring changes

- `mindy-cli/tsconfig.json` — all paths are relative (`./src`, `./dist`)
- `mindy-cli/package.json` — `name` field is `"mindy-cli"` (already correct); scripts are relative
- `mindy-cli/mindy-cli.sh` — uses `$SCRIPT_DIR` (dynamic resolution)
- `.gitmodules` — does not exist
- Root `package.json` — does not exist
