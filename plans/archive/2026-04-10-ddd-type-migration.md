# Plan: DDD Type Migration — Move Domain Value Objects out of shared/types

## Context

The dddsample analysis confirmed the core principle: domain ports must speak domain vocabulary, not infrastructure vocabulary. Currently, several pure domain value objects live in `shared/types/` alongside infrastructure wire-format types (OpenAI/Anthropic raw responses). The split belongs at the layer boundary:

- **Domain language** (FileInfo, ScanResult, LibraryInfo) → `domain/values/`
- **Infrastructure wire formats** (OpenAIRawResponse, AnthropicRawResponse) → `infrastructure/api/llm/`
- **Application-level DTOs** (ContextBuilderOptions, GeneratedPrompt) → stay in `shared/types/` or move to `application/`
- **LLM port types** (LLMRequestPayload, LLMResponse) → treated as stable port-contract types for now (pragmatic decision; full domain-vocabulary refactor deferred)

---

## Migration Table

| Type(s) | From | To | Reason |
|---|---|---|---|
| `FileInfo`, `createFileInfo` | `shared/types/file-info.ts` | `domain/values/file-info.ts` | Pure VO, domain vocabulary |
| `ProjectInfo`, `createProjectInfo` | `shared/types/project-info.ts` | `domain/values/project-info.ts` | Pure VO, domain vocabulary |
| `ScanResult`, `RFileCollection`, `ScanResultProps`, `createScanResult` | `shared/types/scan-result.ts` | `domain/values/scan-result.ts` | Domain aggregate concept |
| `LibraryInfo`, `LibraryScanResult`, `LibraryScanOptions`, `createLibraryInfo`, `createLibraryScanResult` | `shared/types/library-info.ts` | `domain/values/library-info.ts` | Domain value objects |
| `EnvironmentContext` | `shared/types/prompt-context.ts` | `domain/values/environment-context.ts` | Domain VO (combines two scan results) |
| `OpenAIRawResponse`, `AnthropicRawResponse` | `shared/types/llm-types.ts` | `infrastructure/api/llm/gateway/llm-gateway.ts` (local types) | Infrastructure wire format; no domain meaning |
| `LLMRequestPayload`, `LLMResponse` | `shared/types/llm-types.ts` | Stay in `shared/types/llm-types.ts` | Port-contract types; full domain-vocabulary refactor (PromptRequest/PromptResult) deferred |

---

## Step-by-Step Plan

### Phase 1 — Move value objects to domain/values/ (low risk)

**1a. Create `domain/values/file-info.ts`**
- Copy content from `shared/types/file-info.ts` verbatim
- Keep `shared/types/file-info.ts` as re-export shim: `export { FileInfo, createFileInfo } from '../../domain/values/file-info'`

**1b. Create `domain/values/project-info.ts`**
- Copy from `shared/types/project-info.ts`
- Keep shim in original location

**1c. Create `domain/values/scan-result.ts`**
- Copy from `shared/types/scan-result.ts`
- Note: depends on `FileInfo` and `ProjectInfo` — import from new domain locations
- Keep shim in original location

**1d. Create `domain/values/library-info.ts`**
- Copy from `shared/types/library-info.ts`
- Keep shim in original location

### Phase 2 — Split prompt-context.ts

**2a. Create `domain/values/environment-context.ts`**
- Extract only `EnvironmentContext` interface
- Imports: `LibraryScanResult` from `domain/values/library-info`, `ScanResult` from `domain/values/scan-result`

**2b. Update `shared/types/prompt-context.ts`**
- Remove `EnvironmentContext` definition
- Import `EnvironmentContext` from `domain/values/environment-context` and re-export it
- Keep `ContextBuilderOptions`, `GeneratedPrompt`, `ContextSummary`, `CapabilityGroup`, `SupportedLanguage` in place (application-layer types)

### Phase 3 — Move raw wire types to infrastructure

**3a. Move `OpenAIRawResponse`, `AnthropicRawResponse` to infrastructure**
- In `shared/types/llm-types.ts`: remove `OpenAIRawResponse` and `AnthropicRawResponse` interfaces
- In `infrastructure/api/llm/gateway/llm-gateway.ts`: define them as local types (they are already used only in this file and `llm-mapper.ts`)
- In `infrastructure/api/llm/mapper/llm-mapper.ts`: import from gateway or define locally

**3b. Update `shared/types/llm-types.ts`**
- Keep only `LLMRequestPayload`, `LLMResponse`, and `SessionMessage` (port-contract types)
- Remove re-export of deleted raw types

### Phase 4 — Update domain/values barrel

Add `domain/values/index.ts` (or update if it exists) to re-export new value objects:
```ts
export * from './file-info'
export * from './project-info'
export * from './scan-result'
export * from './library-info'
export * from './environment-context'
// existing exports: cache-status, token-budget, llm-output
```

### Phase 5 — Update import paths across the codebase

After shims are in place, gradually migrate direct consumers to import from domain:

Priority importers to update:
- `domain/types/directory-scanner.ts` — uses `ScanResult`, `ScanOptions` (from `shared/types`)
- `application/tools/file-scan-tool.ts` — uses `IDirectoryScanner` (which uses `ScanResult`)
- `application/services/context-builder.ts` — imports `LibraryScanResult`, `ScanResult`, `EnvironmentContext`
- `application/tools/library-scan-tool.ts` — uses `LibraryScanResult`, `LibraryInfo`
- `infrastructure/filesystem/directory-scanner.ts` — implements `IDirectoryScanner`, returns `ScanResult`

---

## Deferred Work (not in this plan)

- Full LLM domain-vocabulary refactor: create `PromptRequest`/`PromptResult` domain types, rewrite `LLMGateway` port in domain language, add mapper to translate to `LLMRequestPayload` — valid DDD, but high churn for current project size.

---

## Verification

```bash
cd cli
bun run build     # TypeScript must compile with zero errors
bun run test      # All tests must pass
```

Spot-check after each phase by running `bun run build` to catch broken imports early.

---

## Critical Files

| File | Role |
|---|---|
| `cli/src/shared/types/file-info.ts` | Source (becomes shim) |
| `cli/src/shared/types/project-info.ts` | Source (becomes shim) |
| `cli/src/shared/types/scan-result.ts` | Source (becomes shim) |
| `cli/src/shared/types/library-info.ts` | Source (becomes shim) |
| `cli/src/shared/types/prompt-context.ts` | Split: EnvironmentContext extracted |
| `cli/src/shared/types/llm-types.ts` | Split: raw types removed |
| `cli/src/domain/values/` | All new files land here |
| `cli/src/infrastructure/api/llm/gateway/llm-gateway.ts` | Receives raw wire types |
| `cli/src/infrastructure/api/llm/mapper/llm-mapper.ts` | May need import fix |
| `cli/src/domain/types/directory-scanner.ts` | Update to import from domain |
| `cli/src/application/services/context-builder.ts` | Update imports |
