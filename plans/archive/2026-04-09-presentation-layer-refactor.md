# Presentation Layer Refactoring — Archive

**日期：** 2026-04-09
**Conversation ID：** 9f6b3f84-2667-4c10-b15e-e3e32e200fd4

---

## 任務目標

MindyCLI `cli/src/presentation/` 完整重構，修復 5 類問題：

1. Dependency violations（presentation 引用 domain / application / infrastructure）
2. View 混合 format + I/O（untestable）
3. `App.tsx` God Component（296 行含 mapping 邏輯）
4. `ContextStatusBar` 使用 class 模式（含 domain entity import）
5. `SKILL.md` 未反映 CLI 環境（仍是通用 SOA web 版本）

---

## 核心架構決策

### Q1 — SKILL.md 範圍 → **A：整個替換為 CLI-specific**
### Q2 — View Model 位置 → **A：`presentation/view-models/`**
### Q3 — ContextStatusBar 模式 → **A：純函數，settings 由 caller 傳入**

---

## 新建 / 修改檔案

### 新建

| 檔案 | 說明 |
|---|---|
| `presentation/view-models/index.ts` | Presentation-only DTOs（primitive fields only）|
| `presentation/tui/event-mapper.ts` | 純函數 `mapAgentEventToMessage(event) → MappedEvent` |

### 重寫（核心邏輯改變）

| 檔案 | 主要變更 |
|---|---|
| `presentation/views/scan-result.ts` | 移除 `DISPLAY` infra import；format/display 分離 |
| `presentation/views/library-result.ts` | format/display 分離；接受 `LibraryScanResultVM` |
| `presentation/views/environment-result.ts` | 移除 domain 型別，接受 `EnvironmentSummaryVM` |
| `presentation/views/context-result.ts` | 移除 `EnvironmentReport` application import；接受 `ContextDisplayVM` |
| `presentation/views/context-status-bar.ts` | Class → 純函數；移除 `ConversationSession` / `ContextHealth` / `getSettings` import |
| `presentation/views/index.ts` | 更新 barrel export |
| `presentation/tui/App.tsx` | 296 → 180 行；event mapping 移至 event-mapper.ts |
| `presentation/SKILL.md` | 全部替換為 CLI-specific rules（含 Fowler / Khorikov 參考）|

### 更新（Controller 責任調整）

| 檔案 | 主要變更 |
|---|---|
| `controllers/agent.ts` | `new ContextStatusBar().render(session)` → `displayStatusBar(vm, config)` |
| `controllers/ask.ts` | 同上 |
| `controllers/scan.ts` | `displayScanResult(result, dir)` → 建 `ScanResultVM` 後呼叫 |
| `controllers/library.ts` | `displayLibraryResult(result)` → 建 `LibraryScanResultVM` 後呼叫 |
| `controllers/context.ts` | 建 `ContextDisplayVM`；移除 `DISPLAY` infra import |

---

## 確立的架構規則

```
Presentation Layer 三大禁止：
  ✗ import from domain/
  ✗ import from application/services/
  ✗ import from infrastructure/

View 兩層模式：
  formatXxx(vm: VM): string[]   → 純函數，禁止 console.log，可 unit test
  displayXxx(vm: VM): void      → 薄包裝，只 forEach console.log

Controller 的映射責任（Application Layer）：
  - 讀 settings（getSettings()）        ← infrastructure 讀取在這裡
  - domain entity / report → VM mapping ← 不讓 view 依賴 domain
  - 呼叫 presentation view 函數
```

---

## Event Mapper 設計

```typescript
// tui/event-mapper.ts — 純函數，無 React / 無 side effect
export function mapAgentEventToMessage(event: AgentEvent): MappedEvent {
    // MappedEvent = { message?: TUIMessage; sideEffect?: EventSideEffect }
}

// App.tsx — 只應用結果
const { message, sideEffect } = mapAgentEventToMessage(event);
if (message)                addMessage(message);
if (sideEffect?.statusData) setStatusData(sideEffect.statusData);
```

---

## 驗證結果

| 指令 | 結果 |
|---|---|
| `bun run build` | ✅ 0 type errors |
| `bun test` | ✅ 189 pass；54 pre-existing infra failures（無關，已知問題）|

---

## 知識庫紀錄

- `experience/skill-presentation-layer.md` — 6 步驟重構流程、陷阱、參考資料
- `experience/_index.json` — 新增 `presentation-layer` 條目

---

## 參考資料

| 作者 | 資源 |
|---|---|
| Martin Fowler | [Presentation Model](https://martinfowler.com/eaaDev/PresentationModel.html) |
| Martin Fowler | [Separated Presentation](https://martinfowler.com/eaaDev/SeparatedPresentation.html) |
| Vladimir Khorikov | [DTO vs Value Object vs POCO](https://enterprisecraftsmanship.com/posts/dto-vs-value-object-vs-poco/) |
| Robert C. Martin | *Clean Architecture* (2017), Ch.22 — The Dependency Rule |
