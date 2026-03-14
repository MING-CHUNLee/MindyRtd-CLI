# Clean Code Review & Fix Report

**Date:** 2026-03-14  
**Scope:** Full CLI codebase (`cli/src/`)  
**Files Reviewed:** 30+ source files across all layers  
**Baseline Review:** [full-codebase-2026-02-19-review.md](./full-codebase-2026-02-19-review.md)  
**Reviewer:** AI Clean Code Analysis  

---

## Architecture Overview (Updated)

The project now follows a **Clean Architecture** pattern with significantly improved layer separation vs. the February review:

```
src/
├── domain/              # Pure domain (zero deps) — entities, VOs, interfaces
│   ├── entities/        # ConversationSession, ConversationTurn, Artifact, KnowledgeEntry
│   ├── values/          # TokenBudget, CacheStatus (immutable VOs)
│   ├── interfaces/      # ITool contract
│   ├── lib/             # Pure data lookups (model-limits, token-pricing)
│   └── repositories/    # ISessionRepository (interface only)
├── application/
│   ├── controllers/     # CLI commands (Commander handlers)
│   ├── services/        # Business logic (AgentService, Orchestrator, ReActLoop, …)
│   ├── tools/           # Agent tool implementations (FileScan, FileRead, RExec)
│   └── prompts/         # Prompt templates & section builders
├── infrastructure/      # External I/O — API clients, persistence, plugins, config
├── presentation/        # Views, status bar, Ink-based TUI, i18n
└── shared/              # Cross-cutting types, utils, static data
```

**Notable improvements since 2026-02-19:**
- ✅ `library-scanner.ts` was split into `r-path-resolver.ts`, `r-script-runner.ts`, `library-scanner.ts` (SRP fix — previously flagged 🔴 P1)
- ✅ `install.ts` was refactored into phase functions (`createServices`, `ensureListenerRunning`, `runSafetyChecksPhase`, `checkAndFilterPackages`, `confirmAndInstall`) — previously 155-line monolith, now well-decomposed
- ✅ `PackageInstaller` now accepts `RBridge` via DI (constructor injection) — previously flagged 🔴 P3
- ✅ Filter callbacks improved (`pkg` instead of `p`)

---

## Scores Summary

| Category | Before (Feb) | Now | Δ | Weight | Weighted |
|----------|:---:|:---:|:---:|:---:|:---:|
| **Variables** | 8/10 | 8/10 | — | 15% | 1.20 |
| **Functions** | 7/10 | 8/10 | +1 | 25% | 2.00 |
| **Classes** | 8/10 | 8/10 | — | 20% | 1.60 |
| **SOLID** | 7/10 | 8/10 | +1 | 20% | 1.60 |
| **Error Handling** | 9/10 | 8/10 | -1 | 10% | 0.80 |
| **Async/Await** | 9/10 | 9/10 | — | 5% | 0.45 |
| **Comments** | 7/10 | 7/10 | — | 5% | 0.35 |
| **Total** | **7.65** | **8.00** | **+0.35** | | **8.00/10** |

**Rating: Good** — Improved from 7.65 → 8.00; close to "Excellent" threshold

---

## 1. Variables (8/10)

### ✅ Strengths
- Constants extracted and named well: `MAX_CONTEXT_TOKENS`, `MULTI_STEP_PATTERN`, `DEFAULT_TOKEN_BUDGET`, `MAX_CONSECUTIVE_ERRORS`
- Consistent camelCase/UPPER_SNAKE conventions across all layers
- Domain value objects have clear, descriptive names (`usagePercent`, `estimatedCostUSD`, `hitRate`)
- Filter callbacks improved: `pkg` instead of `p` in `install.ts`

### ❌ Issues Found

| Issue | File | Line | Severity |
|-------|------|------|----------|
| Short variable `e` in catch blocks | `agent-service.ts` | 227, 329 | Minor |
| Short variable `a` in array operations | `agent-service.ts` | 239-241, 262-263, 302-304 | Minor |
| Unclear `M` constant | `token-budget.ts` | 55 | Minor |
| Single-letter `p` in `getPricing` | `token-budget.ts` | 54 | Minor |
| Non-descriptive callback vars `s`, `m`, `t` | `agent-service.ts`, `context-builder.ts` | Multiple | Minor |

**Specific Examples:**

```typescript
// ❌ agent-service.ts:239 — Single-letter `a` in non-trivial iteration
for (const a of textArtifacts) {
    this.emit('text_output', { content: a.content });
}

// ✅ Suggested
for (const artifact of textArtifacts) {
    this.emit('text_output', { content: artifact.content });
}
```

```typescript
// ❌ token-budget.ts:54-55 — `p` and `M` are non-descriptive
const p = getPricing(this.model);
const M = 1_000_000;

// ✅ Suggested
const pricing = getPricing(this.model);
const TOKENS_PER_MILLION = 1_000_000;
```

```typescript
// ❌ agent-service.ts:130 — `m` in filter/map chains
const loadedPlugins = pluginMetas.filter(m => m.loaded).map(m => m.name);

// ✅ Suggested
const loadedPlugins = pluginMetas.filter(meta => meta.loaded).map(meta => meta.name);
```

**Deductions:** -2 (short variable names in callbacks and catch blocks)

---

## 2. Functions (8/10) ↑ from 7

### ✅ Strengths
- `install.ts` was decomposed into clean phase functions — previously the largest issue
- `executeInstallCommand` is now a clean 20-line orchestrator
- Single-responsibility well enforced in new services (`HistorySummarizer`, `KnowledgeBase`, `Evaluator`)
- `ToolRegistry.execute()` guarantees no thrown exceptions — clean contract
- `ReActLoop` parser cleanly extracted as `parseReActResponse()`
- `extractArtifacts()` properly separated as a module-level pure function

### ❌ Issues Found

| Issue | File | Function | Lines | Severity |
|-------|------|----------|-------|----------|
| Large method | `agent-service.ts` | `executeInstruction` | 142–310 (168 lines) | 🔴 Major |
| Large method | `agent-service.ts` | `executeAskMode` | 378–524 (146 lines) | 🔴 Major |
| Large function | `index.ts` | default `program.action` | 76–127 (51 lines) | Medium |
| Mixed abstraction levels | `agent-service.ts` | `executeInstruction` | Mixes intent, orchestration, validation, I/O | Major |
| Nested function | `agent-service.ts` | `isCasualMessage` inside `executeAskMode` | 383–390 | Minor |

**Specific Examples:**

```typescript
// ❌ agent-service.ts:142-310 — executeInstruction does 6+ things:
//   1. History summarization
//   2. Intent classification (LLM call)
//   3. Knowledge retrieval (RAG)
//   4. Orchestrator execution (ReAct loop)
//   5. Edit artifact validation + retry
//   6. Human-in-the-loop review + file I/O
//   7. Turn persistence

// ✅ Suggested — decompose into phases:
async executeInstruction(instruction: string): Promise<void> {
    const history = await this.prepareHistory();
    const intent = await this.classifyIntent(instruction, history);
    
    if (intent === 'ask') {
        await this.executeAskMode(instruction, history);
        return;
    }
    
    const orchResult = await this.runOrchestration(instruction, history);
    const validatedEdits = await this.validateArtifacts(orchResult);
    await this.applyEditsWithApproval(validatedEdits, orchResult);
    await this.persistTurn(instruction, orchResult);
}
```

```typescript
// ❌ agent-service.ts:378-524 — executeAskMode does 5+ things:
//   1. Casual message detection
//   2. Workspace scanning
//   3. File reading
//   4. Token budget calculation
//   5. System prompt assembly
//   6. LLM streaming

// ✅ Suggested — decompose:
private async executeAskMode(instruction: string, history): Promise<void> {
    const casual = this.isCasualMessage(instruction);
    const context = casual ? '' : await this.buildProjectContext();
    const systemPrompt = this.assembleAskPrompt(context, history, instruction);
    await this.streamResponse(systemPrompt, instruction, history);
}
```

**Deductions:** -2 (two major large functions in `agent-service.ts`)

---

## 3. Classes (8/10)

### ✅ Strengths
- ES6 class syntax everywhere — no constructor function patterns
- Private members properly used (`private readonly _turns`, `private _cumulative`)
- Domain entities are correctly immutable (`readonly` on all public fields)
- `ConversationTurn` — clean, immutable snapshot pattern
- `ToolRegistry` — focused single-responsibility, clean API
- Factory methods (`ConversationSession.create()`, `Artifact.create()`) are idiomatic

### ❌ Issues Found

| Issue | File | Class | Severity |
|-------|------|-------|----------|
| `AgentService` constructor does too much | `agent-service.ts` | `AgentService` | Medium |
| `RBridge.setTimeout` shadows global | `r-bridge.ts` | `RBridge` | Minor |
| Module singleton pattern mismatch | `r-bridge.ts` | `getRBridge()` | Minor |
| `session!` non-null assertion | `agent-service.ts` | `AgentService` | Minor |

**Specific Examples:**

```typescript
// ❌ agent-service.ts:89-106 — Constructor creates 5+ concrete instances
constructor(options, onEvent, onApproval) {
    this.llm = LLMController.fromEnv();      // ❌ Direct creation (not injected)
    this.repo = new SessionRepository();      // ❌ Direct creation
    this.registry = new ToolRegistry();       // OK (factory style)
    this.diffEngine = new DiffEngine();       // ❌ Direct creation
    // Also registers 3 tools directly
    this.registry.register(new FileScanTool()); // ❌ Direct creation
    this.registry.register(new FileReadTool()); // ❌ Direct creation
    this.registry.register(new RExecTool());    // ❌ Direct creation
}

// ✅ Inject dependencies:
constructor(
    options: AgentServiceOptions,
    private readonly deps: AgentServiceDeps,
    onEvent: EventCallback,
    onApproval: ApprovalCallback,
) {
    this.llm = deps.llm;
    this.repo = deps.repo;
    // ...
}
```

```typescript
// ❌ agent-service.ts:80 — non-null assertion indicates design issue
private session!: ConversationSession;  // Set in initialize()

// ✅ Use a getter that throws or make it optional:
private _session?: ConversationSession;
private get session(): ConversationSession {
    if (!this._session) throw new Error('AgentService not initialized');
    return this._session;
}
```

**Deductions:** -2 (constructor DIP violations, `session!` assertion)

---

## 4. SOLID Principles (8/10) ↑ from 7

### ✅ Strengths (Improvements from Feb)
- **SRP ✅**: `library-scanner.ts` was split into 3 focused services
- **SRP ✅**: `install.ts` now uses phase functions, not one monolith
- **DIP ✅**: `PackageInstaller` now accepts `RBridge` via constructor injection
- **OCP ✅**: `ToolRegistry` + `ITool` interface = extensible tool system
- **OCP ✅**: `PluginLoader` dynamically extends the tool registry
- **ISP ✅**: `ITool` interface is minimal (3 members)
- **DIP ✅**: `Orchestrator` depends on abstractions (`LLMController`, `ToolRegistry`)

### ❌ Issues Found

| Issue | Principle | File | Severity |
|-------|-----------|------|----------|
| `AgentService` constructor creates concrete deps | DIP | `agent-service.ts` | 🔴 Major |
| `AgentService.executeInstruction` has 6+ responsibilities | SRP | `agent-service.ts` | 🔴 Major |
| `Orchestrator` creates `ReActLoop` internally | DIP | `orchestrator.ts` | Minor |
| `FileResolver` defaults to `new RubyApiClient()` | DIP | `file-resolver.ts` | Minor |
| Duplicate `Artifact` type (domain vs orchestrator) | DRY | `orchestrator.ts` + `domain/entities/artifact.ts` | Medium |

**Specific Examples:**

```typescript
// ❌ orchestrator.ts:32-38 — Redefined Artifact type shadows domain entity
export interface Artifact {
    kind: ArtifactKind;
    content: string;
    path?: string;
}
// domain/entities/artifact.ts already defines Artifact with id, type, content, path

// ✅ Use the domain Artifact or create a distinct name like OrchestratorArtifact
```

```typescript
// ❌ agent-service.ts:175-177 — Direct construction in method body
const kbRepo = new KnowledgeRepository();
const kb = new KnowledgeBase();
kb.load(kbRepo.load());

// ✅ Inject or initialize in constructor
```

**Deductions:** -2 (AgentService DIP violations, type shadowing)

---

## 5. Error Handling (8/10) ↓ from 9

### ✅ Strengths
- Custom error hierarchy intact (`PlumberConnectionError`, `PlumberTimeoutError`)
- `ToolRegistry.execute()` guarantees no thrown exceptions — excellent pattern
- `ReActLoop` tracks `consecutiveErrors` and aborts gracefully
- `Evaluator.retryWithCorrection` — resilient self-healing with max retries
- Proper `instanceof Error` checks in most catch blocks

### ❌ Issues Found

| Issue | File | Line | Severity |
|-------|------|------|----------|
| Empty catch blocks (silent failures) | `agent-service.ts` | 162, 276, 417, 443 | 🔴 Major |
| `error: any` type | `package-installer.ts` | 61 | Medium |
| No error handling for `PluginLoader` | `agent-service.ts` | 128-133 | Minor |
| Silent JSON parse failures | `r-bridge.ts` | 230 | Minor |

**Specific Examples:**

```typescript
// ❌ agent-service.ts:162 — Silent empty catch
try {
    const intentResponse = await this.llm.sendPrompt({...});
    if (intentResponse.content.trim().toLowerCase().includes('ask')) intent = 'ask';
} catch { /* default to edit */ }  // ← No logging, no error tracking

// ✅ At minimum, emit an event:
} catch (e) {
    this.emit('error', { message: `Intent classification failed: ${e instanceof Error ? e.message : String(e)}`, phase: 'intent' });
    // Still default to edit
}
```

```typescript
// ❌ agent-service.ts:417 — Silent scan failure
try {
    const scanTool = this.registry.get('file_scan');
    // ...
} catch { /* continue without scan */ }  // ← User has no idea the scan failed

// ✅ At minimum, emit a warning:
} catch (e) {
    this.emit('status_update', { warning: 'Workspace scan failed, continuing without context' });
}
```

```typescript
// ❌ agent-service.ts:276 — Silent file read
try { original = fs.readFileSync(absPath, 'utf8'); } catch { /* new file */ }
// ← Legitimate for new files, but masks genuine permission/encoding errors

// ✅ Distinguish expected vs unexpected:
} catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.emit('error', { message: `Cannot read ${absPath}: ${(e as Error).message}`, phase: 'review' });
    }
}
```

```typescript
// ❌ package-installer.ts:61 — Still using `error: any`
} catch (error: any) {
    // ...
    throw new Error(`... Error: ${error.message}`);
}

// ✅ Use typed error handling
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`... Error: ${message}`);
}
```

**Deductions:** -2 (4 silent empty catch blocks, one `error: any`)

---

## 6. Async/Await (9/10)

### ✅ Strengths
- Modern `async/await` exclusively — zero callback patterns
- `Promise.all` used for parallel safety checks in `install.ts`
- Streaming support via `llm.streamPrompt()` callback pattern
- `ToolRegistry.execute()` wraps all tool calls in try/catch
- Sequential file reads in `executeAskMode` are intentional (respecting token budget)

### ❌ Issues Found

| Issue | File | Severity |
|-------|------|----------|
| Sequential file reads could use `Promise.all` with budget check | `agent-service.ts:434-444` | Minor |
| `RBridge` uses busy-wait polling loop | `r-bridge.ts:218-237` | Minor (by design) |

```typescript
// ❌ agent-service.ts:434-444 — Sequential reads when files don't depend on each other
for (const f of readTargets) {
    try {
        const readTool = this.registry.get('file_read');
        if (readTool) {
            const result = await readTool.execute({ path: f.path });
            // ...
        }
    } catch { /* skip unreadable files */ }
}

// ✅ Parallel with budget — read all then truncate:
const results = await Promise.all(
    readTargets.map(f => this.registry.get('file_read')?.execute({ path: f.path }))
);
```

**Deductions:** -1 (sequential reads that could be parallel)

---

## 7. Comments (7/10)

### ✅ Strengths
- Excellent file-level JSDoc headers explaining purpose and architecture
- `ReActLoop` format instructions are well-documented
- `HistorySummarizer` includes usage example in the header comment
- `ConversationSession` has clear responsibility documentation
- Comments generally explain "why" not "what"

### ❌ Issues Found

| Issue | File | Severity |
|-------|------|----------|
| Excessive section separators | `r-bridge.ts`, `file-resolver.ts`, `install.ts` | Minor |
| Obvious step comments | `agent-service.ts` | Minor |
| Mixed language comments (Chinese + English) | `diff-engine.ts`, `context-builder.ts` | Minor |
| `context-builder.ts:7-8` — Professor's challenge comment is outdated | `context-builder.ts` | Medium |

```typescript
// ❌ r-bridge.ts — Heavy section separators for small sections (2-5 lines)
// ============================================
// File Paths
// ============================================
function getMindyDir() { ... }
function getPendingFile() { ... }
function getResultFile() { ... }
// ============================================
// Configuration
// ============================================
setTimeout(timeoutMs) { ... }
// Only 3 lines of code — doesn't need a separator

// ✅ Remove separators for sections < 10 lines, use them sparingly for major sections
```

```typescript
// ❌ diff-engine.ts — Mixed language in comments
/**
 * 比較兩個字串並返回帶有顏色的終端機輸出 (Patch 格式簡化版)
 */
// ✅ Choose one language and be consistent (recommend English for public APIs)
```

**Deductions:** -3 (excessive separators, mixed languages, outdated comments)

---

## Top Recommendations (Priority Order)

### 🔴 High Priority

1. **Split `AgentService.executeInstruction`** (168 lines) into phase methods:
   - `prepareHistory()`, `classifyIntent()`, `runOrchestration()`, `validateArtifacts()`, `applyEditsWithApproval()`, `persistTurn()`
   - This is now the single largest function in the codebase

2. **Split `AgentService.executeAskMode`** (146 lines) into:
   - `buildProjectContext()`, `readRelevantFiles()`, `assembleAskPrompt()`, `streamResponse()`
   
3. **Fix 4 silent empty catch blocks** in `agent-service.ts`:
   - Lines 162, 276, 417, 443 — at minimum emit error/warning events
   - Silent failures make debugging extremely difficult

4. **Inject dependencies into `AgentService`** instead of constructing them in the constructor:
   - `LLMController`, `SessionRepository`, `DiffEngine` should all be injected
   - This will dramatically improve testability

### 🟡 Medium Priority

5. **Resolve duplicate `Artifact` type** in `orchestrator.ts` vs `domain/entities/artifact.ts`
   - Either use the domain entity or rename to `OrchestratorArtifact`

6. **Fix `session!` non-null assertion** — use a safe getter pattern

7. **Remove `error: any`** in `package-installer.ts:61` — use `instanceof Error` pattern

8. **Extract TUI launcher** from `index.ts` default action into a dedicated module

9. **Rename `RBridge.setTimeout`** to `setRequestTimeout` to avoid shadowing the global

### 🟢 Low Priority

10. **Use descriptive names** in callbacks: `a` → `artifact`, `m` → `meta`, `s` → `schema`, `p` → `pricing`

11. **Use descriptive constant names**: `M` → `TOKENS_PER_MILLION`, `p` → `pricing`

12. **Remove excessive section separators** — they add noise in sections with < 10 lines of code

13. **Consistent comment language** — choose English for all code comments

14. **Move `isCasualMessage()` out of `executeAskMode()` body** — make it a private method or standalone utility

---

## Progress Tracking (vs 2026-02-19 Review)

### ✅ Fixed Issues

| # | Issue | Status |
|---|-------|--------|
| P1 | Split `library-scanner.ts` into 3 services | ✅ Done |
| P2 | Extract `executeInstallCommand` into phases | ✅ Done |
| P3 | Inject `RBridge` into `PackageInstaller` | ✅ Done |
| P9 | Use `pkg` instead of `p` in filter callbacks | ✅ Done |

### 🔄 Still Open

| # | Issue | Status |
|---|-------|--------|
| P4 | Extract TUI launcher from `index.ts` | 🔄 Still open |
| P5 | Replace `error: any` (5+ occurrences → now 1) | 🟡 Mostly fixed, 1 remains |
| P6 | Rename `RBridge.setTimeout` | 🔄 Still open |
| P7 | Remove obvious comments | 🟡 Partially addressed |
| P8 | Reduce section separators | 🔄 Still open |
| P10 | Parallelize `checkPackages` | 🔄 Still open (now in different file split) |

### 🆕 New Issues (Since Feb)

| # | Issue | Source | Severity |
|---|-------|--------|----------|
| N1 | `AgentService.executeInstruction` 168 lines | New code (agent-service.ts) | 🔴 Major |
| N2 | `AgentService.executeAskMode` 146 lines | New code (agent-service.ts) | 🔴 Major |
| N3 | 4 silent empty catch blocks | New code (agent-service.ts) | 🔴 Major |
| N4 | `AgentService` constructor creates 5+ concrete deps | New code | 🔴 Major |
| N5 | Duplicate `Artifact` type | orchestrator.ts vs domain | 🟡 Medium |
| N6 | `session!` non-null assertion | agent-service.ts | 🟡 Medium |

---

## Test Coverage Gaps

Tests still appear to be limited. Missing coverage for new services:

| File | Has Tests |
|------|-----------|
| `agent-service.ts` | ❌ |
| `orchestrator.ts` | ❌ |
| `react-loop.ts` | ❌ |
| `evaluator.ts` | ❌ |
| `history-summarizer.ts` | ❌ |
| `knowledge-base.ts` | ❌ |
| `tool-registry.ts` | ❌ |
| `context-builder.ts` | ❌ |
| `diff-engine.ts` | ❌ |
| `r-bridge.ts` | ❌ |
| All controllers | ❌ |
| Domain entities | ❌ (partially) |
| Domain value objects | ❌ |

> **Estimated coverage: ~15-20%** — decreased from Feb due to new code without corresponding tests.

---

## Final Assessment

The MindyCLI codebase has **improved meaningfully** since the February review. The three highest-priority issues from last time (split `library-scanner`, decompose `install.ts`, inject `RBridge`) have all been addressed. The architecture is now more modular and better aligned with Clean Architecture principles.

However, the new `AgentService` has become the project's **new complexity hotspot**. Its two main methods (`executeInstruction` at 168 lines and `executeAskMode` at 146 lines) combine multiple responsibilities that should be decomposed into focused phase methods. Additionally, the 4 silent empty catch blocks represent a regression in error handling quality.

**Key Areas for Next Sprint:**
1. 🔴 Decompose `AgentService` methods into phase helpers
2. 🔴 Fix silent error swallowing → emit events/warnings
3. 🔴 Inject dependencies instead of creating in constructor
4. 🟡 Add tests for core services (especially `AgentService`, `Orchestrator`, `ReActLoop`)

**Overall Score: 8.00/10 — Good** (↑ 0.35 from 7.65)
