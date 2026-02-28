## 🔧 Agentic CLI 核心架構與最佳實踐
**日期：** 2026-02-28
**情境：** 建立類似 Claude Code 等由 LLM 驅動、能夠自動掃描、決策並編修本地檔案的 Agentic CLI 應用程式。
**最佳實踐：**
- **三階段處理架構 (Phase 1-3)**：
  1. **Phase 1: Resolve (檔案解析)**：只讀取掃描出檔案的前幾行 (如前 10 行)，並要求 LLM 從中過濾出「這項需求會動到哪些檔案」，能省下極大量的 Context Token，並避免 LLM 注意力分散。
  2. **Phase 2: Edit (生成程式碼)**：將 Phase 1 選出的檔案「完整內容」交給 LLM 進行編輯。此階段需嚴格要求 LLM 輸出特定格式（例如用 Markdown Code Block 包覆檔案路徑與更新後的完整程式碼 / Diff Block）。
  3. **Phase 3: Review (檢核並套用)**：本地端攔截 LLM 的輸出，使用 Diff 工具產出 patch 並呈現於終端機，強制要求使用者進行 Confirm (Y/N)，保留人類最後裁量權。
- **無狀態與直接通訊 (直接溝通 LLM API)**：對於 CLI 工具，省略中間的 Backend 轉交 (如 Node CLI -> Ruby Backend -> LLM API)，改成讓 CLI 透過本地配置工具（`.env`）直接打到 LLM API，能有效降低維護成本與傳輸延遲。
- **配置集中化**：應有一個集中的 `llm-controller` 和 `config` 服務，統一處理重試對策、Timeouts、不同 Provider (OpenAI/Anthropic/Google) 的 payload 轉換。
- **後端非同步日誌 (Off Critical Path)**：如果需要追蹤數據或記錄 session log 給未來的 Ruby/Python Backend 分析，**絕對不要**讓後端介入 Critical Path。應改為「CLI 直接打給 LLM，拿到資料回傳給 User 後，再使用 fire-and-forget 的方式非同步 (async) 將 log POST 給 Backend」。這稱為「Side-effect Logging」，可以結合 `SessionLogger` 類別實作，內部要處理靜默失敗 (`.catch(() => {})`)，保證絕不影響 CLI 的速度與穩定性。
