 # AgentService 角色分析：Facade or Controller?

> Date: 2026-04-09
> Context: Refactoring 過程中發現 `agent-service.ts` 的實際職責與命名不符

## 觀察

按照 `application/SKILL.md` 定義的三元件模型：

| Component | Role | One Reason to Change |
|---|---|---|
| **Controller** | 接收輸入 → 呼叫 Service/Use Case → 回傳輸出 | CLI command 簽名改變 |
| **Form/Request Object** | 驗證與解析 raw input | 輸入驗證規則改變 |
| **Service Object** | 執行實際工作 — 跨層交互 | 處理流程改變 |

### 現狀：三個角色的實際分佈

```
controllers/agent.ts          (位於 application/controllers/)
├── 定義 Commander command (CLI 簽名)
├── 建構 AgentService 並傳入 callbacks
├── onEvent callback: chalk 格式化、ora spinner、console.log
├── onApproval callback: readline prompt
└── 最後: domain session → StatusBarVM → displayStatusBar()

facade/agent-service.ts       (位於 application/facade/)
├── 接收 instruction (input)
├── prepareHistory() — 準備對話歷史
├── classifyIntent() — 意圖分類
├── 根據 intent/mode 路由到對應 Use Case
├── 管理 session lifecycle (load/save)
├── 將結果 persist 並 emit events (output)
└── 處理 slash commands

use-cases/*.ts                (位於 application/use-cases/)
├── ExecuteAskUseCase
├── ExecuteInstructionUseCase
├── ExecuteRunUseCase
├── ExecuteSolverUseCase
└── ExecuteTutorUseCase
```

## 問題：命名與職責不符
### AgentService 實際上是 Controller

對照 SKILL.md 對 Controller 的定義：
- ✅ **接收輸入**：`executeInstruction(instruction)` 接收使用者指令
- ✅ **呼叫 Service/Use Case**：根據 intent 路由到 `askUseCase`、`instructionUseCase` 等
- ✅ **回傳輸出**：透過 `emit()` 將結果傳遞給 presentation

它做的就是 "translates requested behavior to Model, transfers response behavior to View" — 這正是 Controller 的定義。

### controllers/agent.ts 實際上是 Presentation

對照 SKILL.md 對 Presentation Layer 的定義：
- ✅ **顯示結果**：`chalk` 格式化、`ora` spinner、`console.log`
- ✅ **擷取使用者輸入**：`readline` approval prompt
- ✅ **View Object 行為**：domain session → `StatusBarVM` → `displayStatusBar()`
- ✅ **不做邏輯判斷**：所有分支都是「根據 event type 選擇顯示方式」= 純 presentation

## 優缺點分析

### 現行架構的優點

1. **事件驅動解耦**：AgentService 透過 events 與 UI 溝通，不直接依賴 console — 這是好的設計，讓不同 UI (CLI one-shot, TUI interactive) 都能接入
2. **Use Case 已正確抽離**：實際業務邏輯已在 use-cases/ 中，AgentService 不做 domain 決策
3. **可測試性佳**：AgentServiceDeps 注入機制使得 unit test 不需網路呼叫
4. **Session 生命週期集中管理**：初始化、載入、儲存都在一個地方

### 現行架構的缺點

1. **命名誤導**：
   - `facade/agent-service.ts` 叫 "facade" + "service"，但行為是 Controller
   - `controllers/agent.ts` 叫 "controller"，但行為是 Presentation/View
   - 新開發者閱讀架構時會困惑

2. **職責邊界模糊**：
   - AgentService 同時做 Controller 工作（路由 intent → use case）和部分 Service 工作（`executeInstall` 直接呼叫 tool、`prepareHistory` 做 summarization）
   - `executeInstall` 方法繞過 use case 直接操作 tool — 違反統一的 Controller → Use Case 模式

3. **controllers/ 資料夾放了 Presentation 程式碼**：
   - `controllers/agent.ts` 裡有 `chalk`、`ora`、`readline` — 這些是 presentation 依賴
   - 按照 Clean Architecture，這些應該在 `presentation/` 層

4. **Event callback 在 constructor 注入**：
   - `onEvent` 和 `onApproval` 在 AgentService constructor 中注入
   - 這讓 AgentService 知道「有人在聽」但不知道是誰 — 這是 Observer pattern
   - 但 Observer 通常是 Controller 通知 View 的機制，再次印證 AgentService = Controller

## 結論

| 現行命名 | 實際角色 | SKILL.md 對應 |
|---|---|---|
| `facade/agent-service.ts` | **Controller** | 接收 input → 路由到 Use Case → emit output |
| `controllers/agent.ts` | **Presentation Adapter** | 建立 View (event handlers) + 啟動 Controller |
| `use-cases/*.ts` | **Service Objects** | 執行實際業務邏輯 |

這不是「錯」，架構運作正常且可測試。但命名不精確會在團隊擴展或學術討論時造成混淆。如果要做 rename refactor，需考慮：

- `controllers/agent.ts` → 移至 `presentation/` 並改名（如 `agent-cli-adapter.ts`）
- `facade/agent-service.ts` → 重新定位為 `controllers/agent-controller.ts` 或保留 facade 但在文件內明確標註其 Controller 本質
- 或者接受現狀，在 SKILL.md 中加註說明 facade 層在本專案中扮演 Controller 角色

> **決策待定** — 記錄以供後續 refactor 討論。
