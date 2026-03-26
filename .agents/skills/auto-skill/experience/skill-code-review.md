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
