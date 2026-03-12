## 🔧 Ink TUI + CJS/ESM 混合架構：用 tsx 子進程 + dynamic import 橋接
**日期：** 2026-03-12
**技能：** ink-tui-repl
**情境：** 在 CJS (tsc CommonJS) 主專案中整合 Ink (ESM-only) TUI，實現持久互動式 REPL
**解法：**
- Ink + yoga-layout 強制要求 ESM（top-level await），無法被 tsc CJS 直接編譯
- TUI 目錄放獨立 `package.json`（`"type": "module"`），tsconfig.json 用 `exclude` 排除 TUI 目錄
- 主入口 `index.ts` 用 `spawn('npx tsx "path/to/tui/index.tsx"')` 子進程啟動 TUI，繞過 CJS 限制
- TUI 內部載入 CJS 模組（如 AgentService）必須用 dynamic `await import()` + fallback：`mod.AgentService ?? mod.default?.AgentService`
- 靜態 `import { X } from '...'` 會觸發 "does not provide an export named" 錯誤（ESM 無法解構 CJS named exports）
**關鍵檔案/路徑：**
- cli/src/presentation/tui/package.json（`"type": "module"`）
- cli/src/presentation/tui/App.tsx（dynamic import in useEffect）
- cli/src/presentation/tui/index.tsx（TUI 入口）
- cli/src/index.ts（spawn tsx 子進程）
- cli/tsconfig.json（exclude TUI 目錄）
**keywords：** ink, esm, cjs, interop, tui, tsx, dynamic-import, yoga-layout

## 🔧 Windows 路徑反斜線導致 process.argv 判斷失敗
**日期：** 2026-03-12
**技能：** ink-tui-repl
**情境：** TUI 啟動後畫面空白/掛起，`isDirectRun` 判斷永遠為 false
**解法：**
- Windows 上 `process.argv[1]` 路徑用反斜線（`\`），但 `includes('tui/index')` 用正斜線比對
- 修正：先 `process.argv[1]?.replace(/\\/g, '/')` 統一為正斜線再比對
- 症狀：banner 顯示後掛起無任何錯誤，因為 `startTUI()` 從未被呼叫
**關鍵檔案/路徑：**
- cli/src/presentation/tui/index.tsx
**keywords：** windows, path, backslash, process-argv, tui, startup-hang

## 🔧 Event-driven AgentService 解耦 I/O
**日期：** 2026-03-12
**技能：** ink-tui-repl
**情境：** 將 console.log/ora/chalk 的 agent 邏輯抽離成可同時服務 TUI 和 CLI 的 headless service
**解法：**
- 建立 `AgentService` class：接收 `EventCallback` 和 `ApprovalCallback`
- 所有 I/O 改為結構化事件：`session_loaded`, `intent_classified`, `phase_start`, `react_step`, `text_output`, `stream_token`, `diff_proposed`, `edit_applied`, `turn_saved`, `error`
- 原 `agent.ts` CLI 控制器變成薄包裝：建立 AgentService + console-based event listeners
- TUI App.tsx 用 React state 接收事件更新畫面
- Diff 審核用 Promise-based approval：AgentService await → TUI 存 resolve ref → 用戶按 Y/N → resolve
**關鍵檔案/路徑：**
- cli/src/application/services/agent-service.ts
- cli/src/application/controllers/agent.ts（薄包裝）
- cli/src/presentation/tui/App.tsx（事件→狀態映射）
**keywords：** agent-service, event-driven, headless, approval-callback, decouple-io

## 🔧 TUI 狀態機設計：idle → processing → reviewing
**日期：** 2026-03-12
**技能：** ink-tui-repl
**情境：** Ink TUI 需要管理輸入、處理中、diff 審核三種互斥狀態
**解法：**
- `AppState = 'idle' | 'processing' | 'reviewing'`
- Footer 根據狀態切換：idle=TextInput、processing=等待文字、reviewing=Y/N 提示
- `useInput` 只在 idle 狀態下攔截 ESC/Ctrl+C 退出
- DiffReview 組件用 `useInput` 攔截 Y/N 按鍵，回調 `handleReviewDecision`
- 新訊息類型：user, assistant, thinking, tool_call, observation, diff, status, error
**關鍵檔案/路徑：**
- cli/src/presentation/tui/types.ts（TUIMessage, AppState, PendingEdit）
- cli/src/presentation/tui/App.tsx（狀態機邏輯）
- cli/src/presentation/tui/components/Footer.tsx（三態切換）
- cli/src/presentation/tui/components/DiffReview.tsx（Y/N 審核）
**keywords：** state-machine, ink, tui, reviewing, idle, processing, useInput
