# Agent 調用路徑圖

## 整體流程：Facade → Orchestration → Tools → Services → Infra

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Controller (CLI Command)                           │
│                     ask.ts / agent.ts / plugins.ts                         │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  FACADE LAYER: application/facade/agent-service.ts                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • DI 組裝點 (Composition Root)                                            │
│  • 組裝 ToolRegistry (包含所有 tools)                                      │
│  • 組裝 Service 依賴 (FileReadService, DiffEngine 等)                       │
│  • 管理 session lifecycle (load/save sessions)                             │
│  • 發送事件 (phase_start, phase_end, react_step 等)                        │
│  • 路由到 Use Cases (ExecuteAskUseCase, ExecuteInstructionUseCase)         │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
   Ask            Instruction
 Pipeline        / Edit Pipeline
   (q&a)          (編輯)
   │               │
   └──────┬────────┘
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  USE CASE LAYER: application/use-cases/                                    │
│  ExecuteAskUseCase / ExecuteInstructionUseCase / ExecuteRunUseCase        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • 編排完整的業務流程                                                      │
│  • 呼叫 Orchestrator (for Instruction pipeline)                            │
│  • 呼叫 LLMController (for Ask pipeline)                                   │
│  • 呼叫 DiffEngine、Evaluator (for review/validation)                      │
│  • 不直接使用 tools (tools 由 Orchestrator 驅動)                            │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │
      ┌──────┴────────────────────────────┐
      │                                   │
      ▼                                   ▼
┌──────────────────────────┐   ┌─────────────────────────────────┐
│  ASK PIPELINE            │   │ INSTRUCTION PIPELINE            │
│ (沒有 tools 介入)         │   │ (ReAct loop 驅動 tools)         │
├──────────────────────────┤   ├─────────────────────────────────┤
│ 1. FileScan (read only)  │   │ 1. Orchestrator.run()           │
│ 2. FileRead (context)    │   │    ├─ 啟動 ReActLoop           │
│ 3. LLMController         │   │    └─ 管理 token budget        │
│    .streamPrompt()       │   │                                 │
│ 4. 回傳分析結果          │   │ 2. ReActLoop [THOUGHT]/[ACTION] │
└──────────────────────────┘   │    ├─ 呼叫 LLMController      │
                               │    ├─ 解析 markers            │
                               │    └─ 調度 tools             │
                               │                                 │
                               │ 3. ToolRegistry.execute()      │
                               │    └─ 執行 LLM 選定的 tool    │
                               │                                 │
                               │ 4. EditStagingService          │
                               │    └─ 暫存編輯、差異檢查      │
                               │                                 │
                               │ 5. 等待用戶審核確認           │
                               └─────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION LAYER: application/orchestration/                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ReActLoop + Orchestrator + ToolRegistry                                  │
│                                                                             │
│  ReActLoop {                                                              │
│    • 驅動 [THOUGHT] → [ACTION] → [OBSERVATION] 循環                       │
│    • 呼叫 LLMController.sendPrompt() (取得 LLM 回應)                      │
│    • 解析 LLM 輸出 (markers, JSON actions)                                │
│    • 追蹤 step 編號、token usage、consecutive errors                     │
│  }                                                                         │
│                                                                             │
│  Orchestrator {                                                           │
│    • 管理單一/多步驟任務執行                                               │
│    • 監督 token budget (防止超額)                                         │
│    • 提取 artifacts (編輯 + 文本輸出)                                     │
│  }                                                                         │
│                                                                             │
│  ToolRegistry {                                                           │
│    • 註冊所有 AgentTools                                                  │
│    • 執行 schema validation (required params check)                       │
│    • 異常捕獲 (永不拋出，回傳 ToolResult)                                 │
│    • 輸入驗證 → 委派給 tool.execute()                                     │
│  }                                                                         │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│      Tools (LLM-Callable)     │  │  Application Services        │
│  application/tools/           │  │  application/services/       │
├──────────────────────────────┤  ├──────────────────────────────┤
│ • FileScanTool               │  │ • FileReadService            │
│ • FileReadTool               │  │ • DiffEngine                 │
│ • FileEditTool               │  │ • Evaluator                  │
│ • RExecTool                  │  │ • EditStagingService         │
│ • RInstallTool               │  │ • KnowledgeBase              │
│ • RRenderTool                │  │ • HistorySummarizer          │
│ • PdfReadTool                │  │ • IntentRouter               │
│                              │  │ • ModeManager                │
│ 實作 AgentTool interface     │  │                              │
│ ├─ name: string              │  │ 邏輯單位（可複用）           │
│ ├─ schema: ToolSchema        │  │ ├─ 無 schema property        │
│ └─ execute(): ToolResult     │  │ ├─ 不直接被 LLM 呼叫        │
│                              │  │ └─ 由 tools/use-cases 組合   │
│ 工作流程：                    │  │                              │
│ 1. 驗證 LLM 的輸入            │  │                              │
│ 2. 執行安全檢查               │  │                              │
│ 3. 委派給 Service 或 Domain   │  │                              │
│    Interface                 │  │                              │
│ 4. 回傳 ToolResult            │  │                              │
│    (含 content, data, error) │  │                              │
└──────────────┬───────────────┘  └──────────┬───────────────────┘
               │                             │
               └──────────────┬──────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  DOMAIN INTERFACES (Ports): domain/interfaces/                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • IFileSystem (read, write, exists, mkdir, stat)                         │
│  • IRScriptRunner (exec R code)                                           │
│  • ILLMGateway (sendPrompt, streamPrompt)                                 │
│  • IDirectoryScanner (scanWorkspace)                                      │
│  • IAgentTool (name, schema, execute)                                     │
│                                                                             │
│  用途：應用層與基礎設施層的契約                                            │
│        • 應用層不直接依賴具體實現                                         │
│        • Tools/Services 透過 DI 接收 port interface                       │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER: infrastructure/                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  API / LLM 提供者                                                          │
│  ├─ llm-controller.ts (多提供者適配器)                                    │
│  │  └─ OpenAI, Anthropic, Azure, Gemini, Ollama 等                        │
│  └─ 實作 ILLMGateway interface                                            │
│                                                                             │
│  Filesystem                                                               │
│  ├─ local-file-system.ts (Node fs wrapper)                                │
│  │  └─ read, write, exists, mkdir, stat, readBuffer                      │
│  ├─ directory-scanner.ts (遍歷 workspace)                                 │
│  └─ 實作 IFileSystem, IDirectoryScanner interfaces                        │
│                                                                             │
│  R 適配器                                                                  │
│  ├─ r-script-runner.ts (Rscript 執行)                                     │
│  └─ 實作 IRScriptRunner interface                                         │
│                                                                             │
│  持久化層                                                                  │
│  ├─ session-repository.ts (sessions 讀寫)                                 │
│  ├─ knowledge-repository.ts (知識庫持久化)                                │
│  └─ file-finder.ts (檔案搜尋)                                             │
│                                                                             │
│  外部服務                                                                  │
│  ├─ plugin-loader.ts (插件系統)                                           │
│  └─ config/paths.ts (全局路徑常數)                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 層級定義（Clean Architecture）

| 層級 | 位置 | 依賴方向 | 責任 | 例子 |
|------|------|---------|------|------|
| **Controller** | `application/controllers/` | 無外部依賴 | 接收 CLI 命令，調用 Use Case | `ask.ts`, `agent.ts` |
| **Facade** | `application/facade/` | domain + services + infra | 組裝 DI，管理 session，發送事件 | `agent-service.ts` |
| **Use Case** | `application/use-cases/` | domain + orchestration + services | 編排完整業務流程 | `ExecuteInstructionUseCase` |
| **Orchestration** | `application/orchestration/` | domain + tools + services | 協調 agent loop (ReAct) | `ReActLoop`, `Orchestrator`, `ToolRegistry` |
| **Tools** | `application/tools/` | domain interfaces | LLM 的能力單位（名字、schema、execute） | `FileReadTool`, `RExecTool` |
| **Services** | `application/services/` | domain interfaces | 可複用的業務邏輯，不被 LLM 呼叫 | `DiffEngine`, `FileReadService` |
| **Domain Interfaces** | `domain/interfaces/` | 無外部依賴 | 定義端口（ports），應用層依賴這些 | `IFileSystem`, `IRScriptRunner` |
| **Infrastructure** | `infrastructure/` | 實作 domain interfaces | 具體 I/O（檔案系統、LLM API、R 執行） | `LocalFileSystem`, `LLMController` |

---

## 數據流向 (Instruction/Edit Pipeline)

```
Controller (user instruction)
    ↓
ExecuteInstructionUseCase.execute()
    ↓
Orchestrator.run(instruction)
    ├─ Decompose: LLM 分解任務（多步模式）
    ├─ Per-task: ReActLoop.run()
    │    ├─ LLMController.sendPrompt() → [THOUGHT]/[ACTION] markers
    │    ├─ ToolRegistry.execute(toolName, input)
    │    │    ├─ Tool.execute()
    │    │    │    ├─ Validation + Safety checks
    │    │    │    └─ Delegate to Service or Port Interface
    │    │    │         ├─ FileReadService → IFileSystem
    │    │    │         └─ RExecTool → IRScriptRunner
    │    │    └─ Return ToolResult
    │    └─ Append [OBSERVATION] to working messages
    └─ Extract artifacts (file changes)
    ↓
EditStagingService: Diff review
    ↓
User approval callback
    ↓
Apply edits to disk
    ├─ IFileSystem.write()
    │    └─ LocalFileSystem.write()
    └─ Emit edit_applied event

Infrastructure Output:
    └─ Files on disk + session log
```

---

## 重要設計原則

✅ **依賴流向**  
- 只能向內（Controller → Facade → Use Cases → Services → Infrastructure）
- Infrastructure 實作 Domain Interfaces（不直接被 application 層 import）

✅ **Tools vs Services**  
- **Tools**: LLM 呼叫的入口，有 `schema`，薄適配層
- **Services**: 程式碼呼叫的工具，無 `schema`，邏輯單位

✅ **DI 組裝點**  
- `application/facade/agent-service.ts` 唯一的 infra 具體類別 import 位置
- 其他層透過 constructor injection 接收依賴

✅ **ReAct 循環驅動**  
- LLM 決定呼叫哪個 tool（非程式碼決定）
- ToolRegistry 負責分派和異常處理
