# Plan: Move `domain/interfaces/` → `domain/types/`

## Context

The `domain/interfaces/` directory holds 5 interface contract files but is not mentioned in `cli/src/domain/SKILL.md`. The documented DDD structure defines `domain/types/` as the correct location for "Shared constrained types." Moving these files aligns the codebase with the architecture documentation and simplifies import depth.

`domain/types/` does not exist yet — it will be created as part of this change.

---

## Files to Move

| Source | Destination |
|--------|-------------|
| `cli/src/domain/interfaces/agent-tool.ts` | `cli/src/domain/types/agent-tool.ts` |
| `cli/src/domain/interfaces/directory-scanner.ts` | `cli/src/domain/types/directory-scanner.ts` |
| `cli/src/domain/interfaces/file-system.ts` | `cli/src/domain/types/file-system.ts` |
| `cli/src/domain/interfaces/r-script-runner.ts` | `cli/src/domain/types/r-script-runner.ts` |
| `cli/src/domain/interfaces/llm-gateway.ts` | `cli/src/domain/types/llm-gateway.ts` |

---

## Step-by-Step Implementation

### Step 1 — Create `domain/types/` files

Copy each file from `domain/interfaces/` into `domain/types/`, updating internal imports where the relative path changes (one fewer `../` level):

- **`directory-scanner.ts`**: internal import `../../shared/types` → `../shared/types`
- **`llm-gateway.ts`**: internal import `../../shared/types/llm-types` → `../shared/types/llm-types`
- Other 3 files: no internal import changes needed

### Step 2 — Update 22 consumer files

Replace `domain/interfaces/` with `domain/types/` in every import. One file uses a 4-deep relative path:

| Affected file | Old path segment | New path segment |
|---------------|-----------------|-----------------|
| `cli/src/infrastructure/api/llm/gateway/llm-gateway.ts` | `../../../../domain/interfaces/llm-gateway` | `../../../../domain/types/llm-gateway` |
| All other 21 files | `../../domain/interfaces/<name>` | `../../domain/types/<name>` |

**Consumer files by interface:**

`agent-tool` (11 files):
- `application/tools/file-read-tool.ts`
- `application/tools/r-render-tool.ts`
- `application/tools/file-edit-tool.ts`
- `application/tools/r-install-tool.ts`
- `application/tools/r-exec-tool.ts`
- `application/tools/pdf-read-tool.ts`
- `application/tools/file-scan-tool.ts`
- `application/tools/library-scan-tool.ts`
- `application/orchestration/tool-registry.ts`
- `application/services/context-builder.ts`
- `infrastructure/filesystem/plugin-loader.ts`

`llm-gateway` (13 files):
- `application/use-cases/execute-tutor-use-case.ts`
- `application/use-cases/execute-solver-use-case.ts`
- `application/use-cases/execute-run-use-case.ts`
- `application/use-cases/execute-instruction-use-case.ts`
- `application/use-cases/execute-ask-use-case.ts`
- `application/orchestration/react-loop.ts`
- `application/orchestration/orchestrator.ts`
- `application/services/evaluator.ts`
- `application/services/intent-router.ts`
- `application/services/history-summarizer.ts`
- `application/services/slash-command-router.ts`
- `application/controllers/agent-controller.ts`
- `infrastructure/filesystem/file-resolver.ts`
- `infrastructure/api/llm/gateway/llm-gateway.ts` ← 4-deep path

`file-system` (7 files):
- `application/use-cases/execute-solver-use-case.ts`
- `application/use-cases/execute-instruction-use-case.ts`
- `application/tools/r-render-tool.ts`
- `application/tools/pdf-read-tool.ts`
- `application/services/file-read-service.ts`
- `application/services/edit-staging-service.ts`
- `infrastructure/filesystem/local-file-system.ts`

`r-script-runner` (3 files):
- `application/tools/r-render-tool.ts`
- `application/tools/r-exec-tool.ts`
- `infrastructure/r-adapter/r-script-runner.ts`

`directory-scanner` (2 files):
- `application/tools/file-scan-tool.ts`
- `infrastructure/filesystem/directory-scanner.ts`

### Step 3 — Delete `domain/interfaces/` directory

Remove the now-empty directory and its 5 old files.

---

## Verification

```bash
cd cli
bun run build        # Must compile with no errors
bun run test         # All tests must pass
```

After build succeeds, confirm no remaining references:
```bash
grep -r "domain/interfaces" cli/src/   # Must return zero results
```
