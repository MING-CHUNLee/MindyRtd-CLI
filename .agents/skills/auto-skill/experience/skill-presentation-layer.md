## 🔧 Presentation Layer 完整重構流程（MindyCLI）
**日期：** 2026-04-09
**技能：** presentation-layer
**情境：** CLI 的 Presentation Layer 存在 5 類問題：dependency violations（presentation 引用 domain/application/infrastructure）、View 混合 format + I/O、App.tsx God Component、inconsistent 命名規則、SKILL.md 未適應 CLI 環境。

**解法（5步驟）：**

### Step 1 — 先做完整掃描再動手
- 使用 `grep_search` 掃描 `presentation/` 內所有跨層 import
  ```
  import.*from.*application
  import.*from.*domain
  import.*from.*infrastructure
  ```
- 建立問題清單後才開始修改，避免遺漏

### Step 2 — 建立 View Models（最先建立，其他都依賴它）
- 位置：`presentation/view-models/index.ts`
- 所有欄位必須是 primitive（string / number / boolean）
- 不能含任何 domain entity / value object

### Step 3 — 修所有 dependency violations（改 view 本身）
- 移除 view 對 domain/application/infrastructure 的 import
- 改接受 View Model 型別

### Step 4 — 修所有 controller（建 VM → 呼叫 view）
- Controller 負責 `domain → VM mapping`，這是 Application Layer 的責任
- 所有 `getSettings()` 等 infra 讀取也在 controller 做，傳入 VM

### Step 5 — format / IO 分離（每個 view 模組）
```typescript
// Pure formatter（可 unit test，無副作用）
export function formatXxx(vm: XxxVM): string[] { ... }

// Thin I/O wrapper（只有 console.log，不含邏輯）
export function displayXxx(vm: XxxVM): void {
    for (const line of formatXxx(vm)) console.log(line);
}
```

### Step 6 — 從 App.tsx 抽取 Event Mapper
- 新建 `tui/event-mapper.ts`：純函數 `mapAgentEventToMessage(event) → MappedEvent`
- `MappedEvent` 有兩個欄位：`message?` 和 `sideEffect?`
- App.tsx 只負責 state + render，不含任何 switch/case mapping 邏輯

**關鍵檔案/路徑：**
- `cli/src/presentation/view-models/index.ts`（新建）
- `cli/src/presentation/views/context-status-bar.ts`（class → 純函數）
- `cli/src/presentation/views/scan-result.ts`（移除 DISPLAY infra import）
- `cli/src/presentation/views/context-result.ts`（移除 EnvironmentReport application import）
- `cli/src/presentation/tui/event-mapper.ts`（新建）
- `cli/src/presentation/tui/App.tsx`（296→180 行）
- `cli/src/application/controllers/agent.ts`（建 StatusBarVM）
- `cli/src/application/controllers/ask.ts`（建 StatusBarVM）
- `cli/src/application/controllers/scan.ts`（建 ScanResultVM）
- `cli/src/application/controllers/library.ts`（建 LibraryScanResultVM）
- `cli/src/application/controllers/context.ts`（建 ContextDisplayVM，移除 DISPLAY infra）
- `cli/src/presentation/SKILL.md`（整個替換為 CLI-specific rules）

**常見陷阱：**
- `ContextStatusBar` 是 class → 改純函數後，所有 caller 的 `new ContextStatusBar().render(session)` 都要找出來換掉（本次有 agent.ts 和 ask.ts 兩個）
- `bun run build` 先跑，有 type error 就先解，再跑 `bun test`
- 54 個 pre-existing 的 infra test failures（`vi.resetModules is not a function`）是無關的，不用理

**參考資料（Authoritative）：**
- Martin Fowler — [Presentation Model](https://martinfowler.com/eaaDev/PresentationModel.html)
- Martin Fowler — [Separated Presentation](https://martinfowler.com/eaaDev/SeparatedPresentation.html)
- Vladimir Khorikov — [DTO vs Value Object vs POCO](https://enterprisecraftsmanship.com/posts/dto-vs-value-object-vs-poco/)
- Robert C. Martin — Clean Architecture Ch.22: The Dependency Rule

**keywords：** presentation-layer, view-model, dependency-violation, format-io-separation, event-mapper, god-component, clean-architecture, CLI, SKILL.md
