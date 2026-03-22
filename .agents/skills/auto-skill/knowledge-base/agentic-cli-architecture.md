## 🔧 Agentic CLI 核心架構與最佳實踐
**日期：** 2026-03-02
**情境：** 建立類似 Claude Code 等由 LLM 驅動、能夠自動掃描、決策並編修本地檔案的 Agentic CLI 應用程式。
**最佳實踐：**
- **三階段處理架構 (Phase 1-3)**：
  1. **Phase 1: Resolve (檔案解析)**：掃描出檔案並交由遠端或本地策略過濾出「這項需求會動到哪些檔案」，省下大筆 Context Token，並避免 LLM 注意力分散。
  2. **Phase 2: Edit (生成程式碼)**：將 Phase 1 選出的檔案「完整內容」交給 LLM 進行編輯。必須要求產出特定格式 (例如 Markdown Code Block 包覆檔案路徑與 Diff Block)。
  3. **Phase 3: Review (檢核並套用)**：本地端攔截 LLM 的輸出，使用 Diff 工具產出 patch 並呈現於終端機，強制要求使用者進行 Confirm (Y/N)，保留人類最後裁量權。
- **職責分離：API Client 與 LLM 抽象層**：
  - `ruby-api-client.ts`：**Primary Gateway**，負責所有涉及業務邏輯的 Agent Command (如 `resolveFiles` 與 `editFiles`)。將請求傳送至 Ruby 後端，由後端負責編排 LLM 的運算邏輯。
  - `llm-controller.ts`：**Generic LLM Utility**，作為通用的底層 LLM 工具。僅保留單純的 LLM 通訊能力 (如 `sendPrompt`, `analyzeCode`)，不應包含任何業務邏輯 (如 resolve/edit 檔案的操作)。
  - 若需要純本地端模式 (無需 Ruby server)，應建立共享介面 `i-agent-client.ts` (定義 `resolveFiles`/`editFiles`)，然後由 `ruby-api-client.ts` 及另一個 `direct-llm-agent.ts` 分別實作，避免 `llm-controller.ts` 的職責過度膨脹。
- **Staged Edit Pattern（檔案寫入單一責任）**：
  - 將所有 `fs.writeFileSync` 集中在一個專用工具類（如 `FileEditTool`），不允許 use case 或 service 直接寫檔。
  - 工具分三個方法：`execute()`（計算 diff、推入 memory queue，無 fs 副作用）、`drainStagedEdits()`（ReAct loop 結束後清空 queue）、`applyEdit()`（唯一的 fs 寫入點）。
  - LLM 有兩種途徑產生編輯：① ReAct loop 主動呼叫 `file_edit` 工具（已含 diff）、② 輸出 JSON artifact 被 use case 解析（用 `buildStagedEditsFromArtifacts()` 轉換）。兩者 merge 成 `allEdits` 後統一走 approval gate。
  - **Human-in-the-loop 保障**：approval callback 永遠夾在 `drainStagedEdits()` 與 `applyEdit()` 之間，無法繞過。
  - 好處：可測試性高（`execute`/`drain` 不碰 fs，unit test 不需 mock）、diff 在 staging 時即計算完畢、review UI 只需讀 `StagedEdit.diff`。
- **後端非同步日誌 (Off Critical Path)**：如果需要追蹤數據或記錄 session log 給未來的 Ruby/Python Backend 分析，應使用 fire-and-forget 的方式非同步 (async) 將 log POST 給 Backend (Side-effect Logging)。可以結合 `SessionLogger` 類別實作，內部要處理靜默失敗 (`.catch(() => {})`)，保證絕不影響 CLI 的速度與穩定性。

---

## 🔧 三類意圖路由設計（Intent-Based Pipeline Routing）
**日期：** 2026-03-22
**情境：** Agentic CLI 只有 ask/edit 兩類意圖時，「執行 R script 並分析輸出」被誤判為 ask，導致缺少 r_exec 工具而無法執行。
**最佳實踐：**
- **意圖分類的陷阱**：混合操作（如「執行 + 分析」）很容易因為包含 analyze、explain 等動詞被歸到 ask，但 ask pipeline 沒有執行工具，導致 LLM 只能靜態回答。
- **三類意圖原則**：
  | Intent | 使用場景 | 工具集 | Pipeline 複雜度 |
  |--------|---------|--------|----------------|
  | `ask` | 問問題、解釋程式碼 | file_scan, file_read | 低：scan → read → stream |
  | `edit` | 建立/修改/修 bug | 全套 ReAct + file_edit | 高：ReAct loop + approval gate |
  | `run` | 執行並看結果 | r_exec + stream | 中：r_exec → stream analyze |
- **Classifier Prompt 設計**：三類意圖必須在 prompt 中明確分開，不能讓「analyze」這個詞落在兩個類別中。
- **Run Use Case 設計**：`scan → findScript(instruction) → r_exec(source("path", chdir=TRUE)) → streamAnalysis`
  - 用 `source("path", chdir=TRUE)` 而非傳入 code 字串：前者繞過 r_exec 的 UNSAFE_PATTERNS 內容檢查（合法用戶腳本可能包含 write），後者受限制。
  - 若 scan 找不到 script，fall back 為無執行輸出的分析，不中斷流程。
- **Classifier 回應解析順序**：先檢查 `run`，再檢查 `ask`，否則 ask 會吃掉 run（因兩者都可能包含 analyze）。

**關鍵檔案/路徑：**
- `cli/src/application/prompts/intent-classifier.ts`（三類 prompt）
- `cli/src/application/use-cases/execute-run-use-case.ts`（新增）
- `cli/src/application/services/agent-service.ts`（classifyIntent 回傳型別、run branch）

**keywords：** intent-routing, run-use-case, r_exec, source, classifier, pipeline, ask, edit, run
