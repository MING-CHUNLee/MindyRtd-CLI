## 🔧 Clean Code Review 全流程最佳實踐
**日期：** 2026-03-14
**技能：** typescript-clean-code
**情境：** 對整個 CLI 專案進行 Clean Code Review，與二月 baseline 比較並產出改進報告
**解法：**
- 先讀取前次 review 報告（`reviews/` 目錄），確認已修復/未修復的項目
- 按 7 大類別依序逐一評估：Variables → Functions → Classes → SOLID → Error Handling → Async → Comments
- 每個類別先列 Strengths 再列 Issues，給具體的 file:line 定位
- 對比前次分數，明確標記 Δ（漲/跌/持平）
- 問題分為 🔴 High / 🟡 Medium / 🟢 Low 三級
- 產出的 report 保存為 `<scope>-<date>-review.md` 格式
- 最後生成視覺化摘要 artifact 方便快速查閱

**關鍵發現模式：**
- 新增大型 Service 容易成為下一個複雜度熱點（agent-service.ts 取代了之前的 library-scanner.ts）
- 靜默空 catch 區塊是最常見的 Error Handling 退步模式
- DI 注入改善通常需要同步更新 controller 層的 service 建構方式

**關鍵檔案/路徑：**
- skills/typescript-clean-code/reviews/
- skills/typescript-clean-code/references/clean-code-checklist.md
- cli/src/application/services/agent-service.ts（最常見的熱點）

**keywords：** clean-code, review, TypeScript, refactor, SOLID, error-handling, agent-service

---

## 🔧 FileEditTool 抽取重構手法（Staged Edit Pattern）
**日期：** 2026-03-21
**技能：** typescript-clean-code
**情境：** `execute-instruction-use-case.ts` 的 `applyEditsWithApproval()` 直接呼叫 `fs.writeFileSync`，散落的 fs 寫入導致難以測試且 approval gate 容易被繞過。
**解法：**
1. 建立 `FileEditTool` 實作 `AgentTool` 介面，內部維護 `private _staged: StagedEdit[]` queue
2. `execute(input)` — 驗證參數、讀原始檔、`diffEngine.generateColoredDiff()`、push 進 `_staged`；回傳 observation 給 LLM，**不寫檔**
3. `drainStagedEdits()` — `return this._staged.splice(0)`；清空 queue，無 fs 副作用
4. `applyEdit(edit)` — `fs.mkdirSync` + `fs.writeFileSync`；**唯一**的寫檔點
5. 在 use case 加 `buildStagedEditsFromArtifacts()`：將 LLM JSON artifact `{path, content}[]` 讀原始檔後轉成 `StagedEdit[]`
6. ReAct loop 結束後：`toolStagedEdits = fileEditTool.drainStagedEdits()` + `artifactEdits = buildStagedEditsFromArtifacts(validatedEdits)` → merge `allEdits` → `applyEditsWithApproval(allEdits)`
7. `AgentService` 建構共用 `FileEditTool` instance，透過 `deps.fileEditTool` 注入 use case

**關鍵規則：**
- `execute()` / `drainStagedEdits()` 絕不碰 fs → unit test 不需 mock fs
- `applyEdit()` 是唯一 fs 寫入點，方便審計與測試隔離
- 若 `original === content` 直接 early return，避免無意義 diff

**關鍵檔案/路徑：**
- `cli/src/application/tools/file-edit-tool.ts`
- `cli/src/application/use-cases/execute-instruction-use-case.ts`
- `cli/src/application/services/agent-service.ts`（inject 點）

**keywords：** file-edit, staged-edit, SRP, refactor, fs, approval-gate, ReAct, use-case, FileEditTool
