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
- **後端非同步日誌 (Off Critical Path)**：如果需要追蹤數據或記錄 session log 給未來的 Ruby/Python Backend 分析，應使用 fire-and-forget 的方式非同步 (async) 將 log POST 給 Backend (Side-effect Logging)。可以結合 `SessionLogger` 類別實作，內部要處理靜默失敗 (`.catch(() => {})`)，保證絕不影響 CLI 的速度與穩定性。
