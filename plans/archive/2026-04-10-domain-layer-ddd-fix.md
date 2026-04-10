# Domain Layer DDD Fix

> Date: 2026-04-10
> Context: Review of `cli/src/domain/` against `domain/SKILL.md` DDD conventions

---

## 問題摘要

現有 `domain/` 結構有三個主要違反 DDD 原則的地方：

1. **`lib/` 混用了 domain policy 與 pure data**
2. **`FileChange` / `LLMOutput` 分類為 entity，但 Belongingness Test 指向 value object**
3. **`artifact.ts` (deprecated) 放在 `entities/` 而非 persistence 層**

---

## Issue 1 — `lib/` 應拆分為 `policies/` + `lib/`

### 現況

```
domain/lib/
├── agent-file-filters.ts   ← domain policy（哪些檔案可以被編輯）
├── model-limits.ts         ← pure lookup table
└── token-pricing.ts        ← pure lookup table
```

### 問題

`agent-file-filters.ts` 裡的 `isFilenameEditable()` / `isContentEditable()` 是 domain 專家會說出的業務規則（"lock files 不應被編輯"、"dist/ 是 generated output"），屬於 **domain policy**。

`model-limits.ts` 和 `token-pricing.ts` 只是 read-only 常數表，沒有業務邏輯，屬於 **domain data**（保留在 `lib/`）。

### SKILL.md 依據

> Domain policies = business rules a domain expert would articulate, actor-agnostic.
> Constants for thresholds belong in the domain, not in config files or infrastructure.

### 修正方案

```
domain/
├── policies/
│   └── agent-file-policy.ts    ← 從 lib/agent-file-filters.ts 移入，重命名
└── lib/
    ├── model-limits.ts         ← 不動
    └── token-pricing.ts        ← 不動
```

**Rename**: `agent-file-filters.ts` → `agent-file-policy.ts`（命名對齊 `policies/` 語義）

**Export 不變**：`isFilenameEditable`、`isContentEditable`、`MAX_FILE_CONTENT_CHARS` 保持同名，只改路徑。

**更新 import**（唯一用到的地方）：
- `application/tools/file-edit-tool.ts`（或 `execute-instruction-use-case.ts`）

---

## Issue 2 — `FileChange` / `LLMOutput` 分類

### Belongingness Test 結果

| 物件 | 屬於誰 | Belongingness Test | 決定 |
|---|---|---|---|
| `FileChange` | `ConversationTurn` | 描述 turn 的面向，但有 per-file undo 需求 | **留在 `entities/`** |
| `LLMOutput` | `ConversationTurn` | 描述 turn 的面向，無獨立 identity 需求 | **移到 `values/`** |

### `FileChange` — 確認留在 `entities/`

**原因**：未來計畫實作 per-file undo（只還原某個特定 FileChange，而非整個 turn rollback）。
屆時需要 `getFileChangeById()` 或類似機制，`id` 是真正的 identity，不只是 serialization 附帶品。

**待辦（未來實作 per-file undo 時）**：
- 在 `ConversationSession` 加 `getFileChangeById(id: string): FileChange | undefined`
- Application layer 加對應的 undo use case

### `LLMOutput` — 移到 `values/`

`LLMOutput` 只是 text content，沒有 lifecycle，不會被 by-ID 查詢。
`id` 只用在 serialization round-trip。

**修正方案**：`entities/llm-output.ts` → `values/llm-output.ts`（不改 export，只改路徑）

---

## Issue 3 — `artifact.ts` 應移出 `entities/`

### 現況

```ts
// domain/entities/artifact.ts
/** @deprecated — only for backward-compatible deserialization */
export interface ArtifactJSON { ... }
```

### 問題

這是一個 serialization migration interface，只被 `conversation-turn.ts` 的 `fromJSON()` 使用，用來處理舊格式的 session 檔案。它不是 domain concept，是 infrastructure / persistence concern。

### 修正方案

**移動**：`domain/entities/artifact.ts` → `infrastructure/persistence/legacy/artifact-json.ts`

**更新 import**：`domain/entities/conversation-turn.ts` 的 import path 改為 infrastructure 路徑。

> ⚠️ 這會讓 domain 依賴 infrastructure（反向依賴），所以另一個選項是：
> 把 `ArtifactJSON` 保留在 `domain/` 但放進 `domain/legacy/` 或 inline 進 `conversation-turn.ts`。

**推薦**：inline 進 `conversation-turn.ts`（`fromJSON` 就在那裡，interface 只有一個用途）。

---

## 修正後結構

```
domain/
├── entities/
│   ├── conversation-session.ts   ✅ Aggregate Root
│   ├── conversation-turn.ts      ✅ Entity（含 inline ArtifactJSON）
│   ├── file-change.ts            ✅ Entity（per-file undo 需求，保留原位）
│   └── knowledge-entry.ts        ✅ Entity
├── values/
│   ├── cache-status.ts           ✅
│   ├── token-budget.ts           ✅
│   └── llm-output.ts             🔄 moved from entities/
├── policies/
│   └── agent-file-policy.ts      🔄 moved from lib/
├── interfaces/
│   ├── agent-tool.ts             ✅
│   ├── directory-scanner.ts      ✅
│   ├── file-system.ts            ✅
│   ├── llm-gateway.ts            ✅
│   └── r-script-runner.ts        ✅
├── repositories/
│   └── session-store.ts          ✅ (interface-only, DIP-compliant)
└── lib/
    ├── model-limits.ts           ✅
    └── token-pricing.ts          ✅
```

---

## 執行順序

| # | 變更 | 影響範圍 | 風險 |
|---|---|---|---|
| 1 | 移動 `agent-file-filters.ts` → `policies/agent-file-policy.ts` | 1–2 個 import | 低 |
| 2 | 移動 `llm-output.ts` → `values/` | 所有 import `llm-output` 的地方 | 低（需 grep） |
| 3 | Inline `ArtifactJSON` 進 `conversation-turn.ts`，刪除 `artifact.ts` | 僅 `conversation-turn.ts` | 低 |

**建議先做 #1**（最小範圍，驗證 build），再依序做 #2、#3。
