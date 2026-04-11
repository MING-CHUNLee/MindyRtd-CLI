# DDD Domain Layer Conventions

## 🔧 Entity vs Value Object — Belongingness Test
**日期：** 2026-04-10
**情境：** Domain layer refactor，判斷 `llm-output.ts` 應放 `entities/` 還是 `values/`
**最佳實踐：**
- 問「這個物件有沒有獨立的 identity 需求（by-ID 查詢、per-item undo）？」
  - 有 → Entity（`entities/`）
  - 沒有，只是描述另一個 entity 的某個面向 → Value Object（`values/`）
- `LLMOutput`：純文字輸出，不會被 by-ID 查詢，`id` 只是 serialization round-trip 附帶品 → **Value Object**
- `FileChange`：有 per-file undo 需求，`id` 是真正的 identity → **Entity**
- 口訣：「有沒有人會說『給我 id=X 的那個』？」有就是 Entity，沒有就是 Value Object

---

## 🔧 Domain Policy vs Domain Lib — 拆分規則
**日期：** 2026-04-10
**情境：** `lib/agent-file-filters.ts` 同時包含業務規則與純常數表
**最佳實踐：**
- **Domain Policy（`policies/`）**：domain expert 會說出的業務規則，actor-agnostic
  - 例：「lock files 不應被編輯」、「dist/ 是 generated output」
  - 特徵：包含邏輯判斷（if/return），能用業務語言解釋理由
- **Domain Lib（`lib/`）**：純 read-only 常數表，沒有業務邏輯
  - 例：`model-limits.ts`、`token-pricing.ts`
  - 特徵：只是 Set/Map/Array，無函數，無判斷
- 拆分後命名：`policies/agent-file-policy.ts`（對齊 `policies/` 語義）
- Export 名稱不變，只改路徑，降低 import 更新成本

---

## 🔧 Deprecated Serialization Type — Inline 而非獨立檔案
**日期：** 2026-04-10
**情境：** `domain/entities/artifact.ts` 只被 `conversation-turn.ts` 的 `fromJSON()` 使用，且標記 `@deprecated`
**最佳實踐：**
- 一個 interface 只有一個使用點 → inline 進使用的檔案
- 不要移到 infrastructure/persistence（會造成 domain 反向依賴 infrastructure）
- 不要保留 `domain/legacy/` 資料夾（過度設計）
- Inline 後保留 `@deprecated` JSDoc，說明用途（migration path only）
- 刪除原檔後，TS compiler 會確保沒有其他漏網的 import

---

## 🔧 執行順序原則（風險排序）
**日期：** 2026-04-10
**情境：** 同一次 domain refactor 包含多個 issue
**最佳實踐：**
- 先做影響範圍最小的變更（1–2 個 import），驗證 build 後再繼續
- 順序建議：policy 分離 → value object 移動 → deprecated inline → 刪檔
- 每步完成後跑 `bun run test`，確保沒有漏網的 import（test 比 tsc 更容易抓到 dynamic import）
