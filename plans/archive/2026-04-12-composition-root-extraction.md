# Composition Root Extraction: agent-controller.ts

**Date:** 2026-04-12  
**Status:** Planned

---

## Problem

`agent-controller.ts` 目前同時扮演兩個角色：

1. **Controller（協調器）**：路由 intent → 呼叫 use case → 持久化 session → 發事件  
2. **Composition Root（依賴組裝）**：在 constructor 裡 `new` 所有具體實作

因此它的 import 跨越六個來源：

| 來源 | 類別 | 問題 |
|------|------|------|
| `infrastructure/api/llm/gateway/` | `LlmGateway` | concrete class |
| `infrastructure/persistence/` | `SessionRepository` | concrete class |
| `infrastructure/filesystem/` | `LocalFileSystem`, `DirectoryScanner`, `PluginLoader` | concrete classes |
| `infrastructure/r-adapter/` | `RScriptRunner` | concrete class |
| `infrastructure/config/` | `WorkflowMode` | config type |
| `application/tools/` + `application/services/` | 8 個工具 + `EditStagingService`, `FileReadService` | 僅用於 constructor wiring |

這違反 Clean Architecture 的依賴規則：**application 層不該直接依賴 infrastructure 的具體實作**。

---

## Goal

重構後 `agent-controller.ts` 的 import 只剩：

- `domain/` — 介面 + entities（`LLMGateway`, `SessionStore`, `ConversationSession`, `TurnUsage`, `FileChange`）
- `application/services/` — `DiffEngine`, `HistorySummarizer`, `IntentRouter`, `ModeManager`, `SlashCommandRouter`
- `application/use-cases/` — 所有 use case classes
- `application/orchestration/` — `ToolRegistry`
- `shared/` — `SessionMessage`

**完全不出現** 任何 `infrastructure/` 的 import。

---

## Solution: Composition Root → `infrastructure/bootstrap/agent-factory.ts`

```
infrastructure/bootstrap/agent-factory.ts   ← 新檔案：new 所有 infra + 組裝 registry
        ↓ 回傳 AgentControllerDeps
application/controllers/agent-controller.ts ← 只接收介面，不 new 任何 infrastructure
        ↑
presentation/cli/agent-cli-adapter.ts       ← 呼叫 factory，把 deps 傳給 controller
presentation/tui/App.tsx                    ← 同上（dynamic import）
```

---

## Detailed Changes

### 1. `application/services/mode-manager.ts`

Re-export `WorkflowMode` type，讓 controller 可以從 application 層取得：

```ts
export type { WorkflowMode } from '../../infrastructure/config/settings';
```

### 2. `application/controllers/agent-controller.ts`

**新增 interface：**

```ts
/** Application-layer abstraction for plugin loading. */
export interface IPluginLoader {
    loadAll(registry: ToolRegistry): Promise<Array<{ name: string; loaded: boolean }>>;
}
```

**修改 `AgentControllerDeps`：**

| 欄位 | 舊型別 | 新型別 | 說明 |
|------|--------|--------|------|
| `repo` | `SessionRepository` | `SessionStore` | 改用 domain 介面 |
| `pluginLoader` | `PluginLoader` (optional) | `IPluginLoader` (optional) | 改用 application 介面 |
| `registry` | *(不存在)* | `ToolRegistry` (required) | **新增**：由 factory 預先組裝 |
| `llm` | optional (`??`) | required | factory 負責建立預設 |
| `diffEngine` | optional (`??`) | required | factory 負責建立預設 |

**修改 constructor：**

- `deps` 從 `Partial<AgentControllerDeps>` 改為 `AgentControllerDeps`（required）
- 移除所有 `?? new InfraClass()` fallback
- 移除所有工具建立與 `registry.register(...)` 呼叫
- `this.registry = deps.registry`
- `summarizer`、`modeManager`、use cases 保持 optional（仍可從 deps 注入，否則用 application 層 default）

**移除的 imports（共 14 個）：**

```ts
// 移除全部：
import { LlmGateway } from '../../infrastructure/api/llm/gateway/llm-gateway';
import { SessionRepository } from '../../infrastructure/persistence/session-repository';
import { LocalFileSystem } from '../../infrastructure/filesystem/local-file-system';
import { DirectoryScanner } from '../../infrastructure/filesystem/directory-scanner';
import { RScriptRunner } from '../../infrastructure/r-adapter/r-script-runner';
import { PluginLoader } from '../../infrastructure/filesystem/plugin-loader';
import { WorkflowMode } from '../../infrastructure/config/settings';
import { FileScanTool } from '../tools/file-scan-tool';
import { FileReadTool } from '../tools/file-read-tool';
import { FileEditTool } from '../tools/file-edit-tool';
import { PdfReadTool } from '../tools/pdf-read-tool';
import { RExecTool } from '../tools/r-exec-tool';
import { RInstallTool } from '../tools/r-install-tool';
import { RRenderTool } from '../tools/r-render-tool';
import { LibraryScanTool } from '../tools/library-scan-tool';
import { EditStagingService } from '../services/edit-staging-service';
import { FileReadService } from '../services/file-read-service';
```

**新增的 imports：**

```ts
import { SessionStore } from '../../domain/repositories/session-store';
import { WorkflowMode } from '../services/mode-manager';   // re-exported
```

### 3. `infrastructure/bootstrap/agent-factory.ts` *(新檔案)*

**職責：** new 所有 infrastructure 具體實作、組裝 ToolRegistry、回傳完整 deps。

```ts
export interface AgentInfraDeps {
    llm: LLMGateway;
    repo: SessionStore;
    diffEngine: DiffEngine;
    registry: ToolRegistry;          // pre-built, all tools registered
    pluginLoader: IPluginLoader;
}

export function buildAgentDeps(directory: string): AgentInfraDeps {
    const llm      = LlmGateway.fromEnv();
    const repo     = new SessionRepository();
    const diffEngine = new DiffEngine();
    const fs       = new LocalFileSystem();
    const registry = new ToolRegistry();
    const stagingService  = new EditStagingService(fs, diffEngine);
    const fileReadService = new FileReadService(fs);

    registry.register(new FileScanTool(new DirectoryScanner()));
    registry.register(new FileReadTool(fileReadService));
    registry.register(new FileEditTool(stagingService));
    registry.register(new PdfReadTool(fs));
    const rRunner = new RScriptRunner();
    registry.register(new RExecTool(rRunner));
    registry.register(new RInstallTool());
    registry.register(new RRenderTool(fs, rRunner));
    registry.register(new LibraryScanTool());

    return { llm, repo, diffEngine, registry, pluginLoader: new PluginLoader() };
}
```

### 4. `presentation/cli/agent-cli-adapter.ts`

```ts
// 新增 import
import { buildAgentDeps } from '../../infrastructure/bootstrap/agent-factory';

// 修改 executeAgentCommand
const deps = buildAgentDeps(options.directory);
const controller = new AgentController(
    { directory: options.directory },
    viewAdapter,
    approvalGate,
    deps,                           // ← 傳入 factory 產出的 deps
);
```

### 5. `presentation/tui/App.tsx`

```ts
// dynamic import 加上 factory
const [ctrlMod, factoryMod] = await Promise.all([
    import('../../application/controllers/agent-controller.js'),
    import('../../infrastructure/bootstrap/agent-factory.js'),
]);
const deps = factoryMod.buildAgentDeps(config?.directory ?? process.cwd());
const service = new ctrlMod.AgentController(
    { directory: config?.directory ?? process.cwd() },
    handleAgentEvent,
    onApproval,
    deps,
);
```

### 6. `tests/unit/application/agent-service.test.ts`

| 舊 | 新 |
|----|-----|
| `vi.mock('../tools/file-scan-tool', ...)` | 移除（工具不再在 controller constructor 建立） |
| `vi.mock('../tools/file-read-tool', ...)` | 移除 |
| `vi.mock('../tools/r-exec-tool', ...)` | 移除 |
| `import { SessionRepository }` | 移除，改用 inline object |
| `import { PluginLoader }` | 移除，改用 inline object |
| `const deps = { llm, repo, diffEngine, pluginLoader }` | `const deps = { llm, repo, diffEngine, registry: new ToolRegistry(), pluginLoader: { loadAll: async () => [] } }` |

---

## Layer Diagram After Refactor

```
┌──────────────────────────────────────────────────────────┐
│  presentation/                                           │
│    agent-cli-adapter.ts                                  │
│    App.tsx                                               │
└──────────────┬───────────────────────┬───────────────────┘
               │ new AgentController() │ buildAgentDeps()
               ▼                       ▼
┌──────────────────────┐  ┌────────────────────────────────┐
│  application/        │  │  infrastructure/bootstrap/     │
│    agent-controller  │  │    agent-factory.ts            │
│                      │  │                                │
│  imports only:       │  │  imports:                      │
│  - domain/           │  │  - infrastructure/** (all)     │
│  - application/      │  │  - application/tools/**        │
│    services/         │  │  - application/services/       │
│    use-cases/        │  │    (EditStagingService,        │
│    orchestration/    │  │     FileReadService)           │
│  - shared/           │  └────────────────────────────────┘
└──────────────────────┘
```

---

## Files Changed

| File | Action |
|------|--------|
| `application/controllers/agent-controller.ts` | Modify — remove infra imports, require full deps |
| `application/services/mode-manager.ts` | Modify — re-export `WorkflowMode` |
| `infrastructure/bootstrap/agent-factory.ts` | **Create** |
| `presentation/cli/agent-cli-adapter.ts` | Modify — use factory |
| `presentation/tui/App.tsx` | Modify — use factory in dynamic import |
| `tests/unit/application/agent-service.test.ts` | Modify — remove tool mocks, update deps |

---

## Risks & Notes

- **`stagingService` 共用問題**：`FileEditTool` 和 `ExecuteInstructionUseCase` 共用同一個 `EditStagingService` 實例（用於 staged edits queue）。Factory 必須建立一個 instance 並傳給兩者——現有行為不變，factory 只是把這個 wiring 從 controller 搬出去。
- **TUI dynamic import**：`App.tsx` 用 `import('...agent-controller.js')` 規避 ESM/CJS 問題。Factory 同樣需要 dynamic import。
- **測試影響**：測試不再依賴 `vi.mock` for tools——改為直接注入空的 `ToolRegistry`。use case behavior 仍由 mock LLM 控制，行為不變。
