## 🔧 MindyCLI 全專案架構 Code Review 流程
**日期：** 2026-03-26
**技能：** code-review
**情境：** 對 MindyCLI 專案進行完整的 Clean Architecture 合規性與代碼品質審查

**解法：**
1. 先讀取 `code-review/SKILL.md` 了解 5 步驟流程與輸出格式
2. 同步讀取 `references/architecture-checklist.md`（完整 checklist）
3. 讀取 `experience/_index.json` → 載入 `skill-typescript-clean-code.md`（相關先前經驗）
4. `list_dir` 探索 `cli/src` 全層結構：`application/`、`domain/`、`infrastructure/`、`presentation/`
5. `find_by_name "*.ts"` 列出各層所有檔案，掌握全貌
6. 重點閱讀（按重要性排序）：
   - `controllers/ask.ts` — 入口點，wiring 層
   - `services/agent-service.ts` — 最大複雜度熱點
   - `tools/file-edit-tool.ts` — 最新重構 SRP 示範
   - `use-cases/execute-instruction-use-case.ts` — 編排核心
   - `services/edit-staging-service.ts` — staged edit 模式實作
   - `domain/interfaces/agent-tool.ts` — 介面定義
   - `infrastructure/config/index.ts` — 12-Factor 合規性
7. `find_by_name "*.test.ts"` 確認測試覆蓋範圍
8. 產出 report 存至 artifact

**關鍵發現模式：**
- `agent-service.ts` 繼續是複雜度熱點（449 行，13+ 私有欄位）→ 建議抽出 `IntentRouter`
- Staged Edit Pattern 重構成功：`applyEdit()` 是唯一 fs write 點，符合 SRP
- 最常見 test gap：新增的服務/use-case/tool 沒有同步新增測試（本次：`EditStagingService`、`FileEditTool`、`ExecuteInstructionUseCase`）
- infra import 出現在 controller 層（ask.ts）屬可接受的 composition root 模式
- `catch {}` 空區塊若有注解（`// Error already emitted`）視為合規，非 silent swallowing

**輸出格式：**
- 按 5 步驟：Understand → Architecture → Code Quality → Testing → Documentation
- 問題分 🔴 High / 🟡 Medium / 🟢 Low 三級
- Verdict 表格：優先級 + 問題描述
- Report 儲存為 `<scope>-<date>-review.md` artifact

**關鍵檔案/路徑：**
- `cli/src/application/services/agent-service.ts`（複雜度熱點）
- `cli/src/application/services/edit-staging-service.ts`（staged edit 核心）
- `cli/src/application/tools/file-edit-tool.ts`（SRP 範本）
- `skills/code-review/references/architecture-checklist.md`
- `skills/code-review/references/mvc-architecture.md`

**keywords：** code-review, architecture, clean-architecture, dependency-inversion, staged-edit, test-coverage, agent-service, MindyCLI

---

## 🔧 Code Review 後的三種常見重構手法
**日期：** 2026-03-26
**技能：** code-review
**情境：** 根據 code review 產出的 🟡 Medium 建議，對 `agent-service.ts`、`execute-instruction-use-case.ts`、`edit-staging-service.ts` 進行重構

**解法：**

### 1. 抽出 IntentRouter（大型 Service 縮減）
- 將 `AgentService` 內的 `classifyIntent()` + `detectObviousIntent()` 靜態方法整體移到新建的 `application/services/intent-router.ts`
- `IntentRouter(llm, emit)` 透過 constructor DI 注入 AgentService
- `AgentService.classifyIntent()` 縮減為 1 行：`return this.intentRouter.classify(instruction, history)`
- 效果：`agent-service.ts` 減少約 50 行，`IntentRouter` 可獨立 unit test
- **注意**：`emit` 須在 `IntentRouter` 建構前透過 `bind` 轉型為寬型別後傳入

### 2. 抽出 Inline System Prompt（可讀性與可測試性）
- 在 `application/prompts/` 新建 `instruction-agent.ts`，匯出 `buildInstructionAgentPrompt(directory, toolsText, knowledgeText?)`
- use case 的 `runOrchestration()` 只需呼叫此函式，不再維護長字串
- **模式**：`knowledgeText` 為 optional，避免空值判斷散落在 builder 外部

### 3. ErrnoException Type Guard（型別安全）
- **問題**：`(error as NodeJS.ErrnoException).code` 是不安全的 cast，若 error 非 Node 系統錯誤會 silent fail
- **解法**：在同一個檔案頂端新增 private type guard：
  ```typescript
  function isNodeError(e: unknown): e is NodeJS.ErrnoException {
      return e instanceof Error && 'code' in e;
  }
  ```
- 使用方式：`if (!isNodeError(error) || error.code !== 'ENOENT') { ... }`
- **優點**：不需要外部 import，型別安全，且邏輯更清晰（ENOENT = 允許跳過，其他錯誤 = emit error）

**關鍵規則：**
- 每次重構後必須跑 `bun vitest run` 確認 180 tests 全過
- `IntentRouter` 建立時機：`ToolRegistry` 初始化完成後、use case 建構前，確保 `emit` bind 順序正確
- Test mock 中的 `OrchestratorResult` 不含 `finalResponse` 欄位—若 interface 變更須更新 mock defaults

**關鍵檔案/路徑：**
- `cli/src/application/services/intent-router.ts`（新建）
- `cli/src/application/prompts/instruction-agent.ts`（新建）
- `cli/src/application/services/edit-staging-service.ts`（type guard）
- `cli/src/application/services/agent-service.ts`（delegate to IntentRouter）
- `cli/src/application/use-cases/execute-instruction-use-case.ts`（use buildInstructionAgentPrompt）

**keywords：** refactor, intent-router, system-prompt, type-guard, ErrnoException, SRP, agent-service, MindyCLI
