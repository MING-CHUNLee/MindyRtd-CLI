# Entrypoint Call Order: index.ts → CLI / TUI Layer

## 目的

記錄從 `src/index.ts`（頂層 dispatcher）到 CLI layer（`cli/index.ts → startCLI`）或 TUI layer（`tui/index.tsx → startTUI`）的完整呼叫順序，特別釐清 `displayBanner` 的匯入時機。

---

## 整體分岐邏輯（src/index.ts）

```
process.argv.length === 2?
├─ YES → TUI path
└─ NO  → CLI path
```

---

## CLI Path（有子命令時）

```
src/index.ts
│
│  dynamic import('./cli/index')
▼
src/cli/index.ts   ← 此時才執行 module-level imports
│
│  import { displayBanner }  from './presentation/views/banner'
│  import { createAgentCommand } from './presentation/agent-cli-presenter'
│  import { createAskCommand }   from './presentation/ask-cli-presenter'
│  import { createKnowledgeCommand } from './presentation/knowledge-cli-presenter'
│  import { getSettings }           from '../infrastructure/config/settings'
│  import { createAgentController } from '../composition/create-agent-controller'
│
▼
startCLI()
│
│  1. 讀取 package.json → version
│  2. new Command() → program
│  3. program.hook('preAction', () => displayBanner())
│     └─ displayBanner() 在每個子命令執行前被呼叫，不是在 import 時
│  4. getSettings()
│  5. createAgentCommand(...)  → Commander sub-command (agent)
│  6. createAskCommand(...)    → Commander sub-command (ask)
│  7. createKnowledgeCommand(...)
│  8. program.parse(process.argv)
│     └─ Commander 解析 argv，觸發對應子命令
│        └─ preAction hook 呼叫 displayBanner()
│           └─ banner.ts: console.log(getBanner())
```

### 關鍵順序說明

| 步驟 | 時機 | 位置 |
|------|------|------|
| `import { displayBanner }` | module load（`startCLI` 被 import 時） | `cli/index.ts` 頂層 |
| `displayBanner()` 實際執行 | `program.parse()` → Commander `preAction` hook | `startCLI()` 內部 |

> **結論**：`index.ts` 必須先 `import('./cli/index')` → 才會觸發 `cli/index.ts` 的 module-level import（包含 `displayBanner`）。`displayBanner` 函式本身在 `program.parse()` 後的 `preAction` hook 才真正執行。

---

## TUI Path（無子命令時）

```
src/index.ts
│
│  new Function('p', 'return import(p)')('./tui/index.js')
│  ↑ 用 Function 包裝是為了讓 tsc 不型別檢查此 ESM 動態 import
▼
src/tui/index.tsx
│
│  import React from 'react'
│  import { render } from 'ink'
│  import App from './controller/AppController.js'
│
▼
startTUI(config?)
│
│  render(<App config={config} />)
▼
src/tui/controller/AppController.tsx
│
│  useEffect → initAgent()
│     └─ dynamic import('../../composition/create-agent-controller.js')
│        └─ createAgentController({ directory, viewAdapter, approvalGate, ... })
│           └─ service.initialize({ sessionId, forceNew })
│
│  useInput → keyboard shortcuts (Esc / Ctrl+C)
│
│  handleSubmit(userInput)
│     ├─ slash command → service.handleSlashCommand(input)
│     └─ normal input  → service.executeInstruction(input)
│
▼
src/tui/presentation/App.tsx   ← 純 view，無業務邏輯
```

---

## 完整呼叫序列圖（CLI path，以 `agent` 子命令為例）

```
node dist/index.js agent "fix bug"
        │
        ▼
src/index.ts (IIFE)
  isTUI = false
        │
        │ dynamic import('./cli/index')
        ▼
src/cli/index.ts — module load
  ← import displayBanner
  ← import createAgentCommand
  ← import createAskCommand
  ← import createKnowledgeCommand
  ← import getSettings
  ← import createAgentController
        │
        ▼
startCLI()
  program = new Command()
  program.hook('preAction', displayBanner)
  getSettings()
  createAgentCommand(...)
  createAskCommand(...)
  program.addCommand(...)
  program.parse(argv)
        │
        │ Commander dispatches → agent command
        │ preAction fires
        ▼
displayBanner()   ←── banner.ts: chalk 格式化輸出
        │
        ▼
agentCommand.action(...)
  → cli-agent-controller.ts: runAgent()
  → agent-cli-presenter.ts (view adapter)
  → createAgentController (composition root)
  → AgentController / AgentService (application layer)
  → ReAct loop / Orchestrator / LLMController (infrastructure)
```

---

## 問題點（若有）

目前 `src/index.ts` 的 CLI path 寫法：

```ts
const { startCLI } = await import('./cli/index');
await startCLI();
```

這是正確的：`displayBanner` 的 module-level import 只在 CLI path 被觸發，不會污染 TUI path。若改為靜態 import 在頂層，則 TUI 啟動時也會載入 chalk / Commander 等 CLI 依賴，增加不必要的記憶體佔用。

---

## 檔案對應表

| 檔案 | 角色 |
|------|------|
| `src/index.ts` | 頂層 dispatcher，決定 TUI vs CLI |
| `src/cli/index.ts` | CLI composition root，`startCLI()` 進入點 |
| `src/cli/presentation/views/banner.ts` | `displayBanner()` / `getBanner()` |
| `src/cli/presentation/agent-cli-presenter.ts` | agent Commander sub-command |
| `src/cli/presentation/ask-cli-presenter.ts` | ask Commander sub-command |
| `src/cli/controller/cli-agent-controller.ts` | CLI 層 controller（事件監聽 → 印出） |
| `src/tui/index.tsx` | TUI 進入點，`startTUI()` |
| `src/tui/controller/AppController.tsx` | TUI controller（React state + agent 呼叫） |
| `src/composition/create-agent-controller.ts` | DI composition root（TUI 與 CLI 共用） |
