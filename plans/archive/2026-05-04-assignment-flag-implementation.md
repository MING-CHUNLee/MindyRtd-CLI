# `--assignment` Flag — Implementation Record

**Date:** 2026-05-04  
**Status:** Done  
**Branch:** main  
**Related plan:** `2026-04-30-ai-tutor-login-init-design.md`

---

## 目標

讓 CLI/TUI 支援：

```bash
mindy-cli --assignment <path>
# 例：
node dist/index.js --assignment tests/fixtures/assignments/CSDS-HW2
bun run mindy -- --assignment tests/fixtures/assignments/CSDS-HW2
```

啟動後自動進入 `tutor-guide` 模式，並載入該 assignment 目錄內的 `tutors/tutor-guide.md` 作為 policy（覆蓋內建 `agent/tutor-guide.md`）。

---

## 測試用 Fixture 結構

```
tests/fixtures/assignments/CSDS-HW2/
├── assignment/
│   ├── HW 02.docx.pdf
│   └── HW 02.docx.txt      ← 作業規格（純文字）
├── student-files/
│   ├── Hw2.Rmd             ← 學生工作檔
│   └── Hw2.pdf
└── tutors/
    └── tutor-guide.md      ← assignment-specific policy（本次實作的核心）
```

`tutors/tutor-guide.md` 定義逐步提示規則（Hint 1→2→3，第 3 次以後才給完整解答），覆蓋 `src/agent/tutor-guide.md` 的通用規則。

---

## 改動清單

### 新增

| 路徑 | 說明 |
|------|------|
| `tests/unit/infrastructure/policy-loader.test.ts` | PolicyLoader overlay 行為的單元測試（5 cases）|

### 修改

| 路徑 | 改動重點 |
|------|---------|
| `src/index.ts` | 解析 `--assignment <path>`；有此 flag 時仍走 TUI 路徑，並將 `assignmentDir` 傳入 `startTUI` |
| `src/tui/presentation/types.ts` | `TUIConfig` 加 `assignmentDir?: string` |
| `src/tui/controller/AppController.tsx` | 歡迎訊息顯示 assignment 名稱；傳 `assignmentDir` 給 `createAgentController` |
| `src/composition/create-agent-controller.ts` | `CreateAgentControllerArgs` 加 `assignmentDir`；傳到 `buildAgentDeps` |
| `src/infrastructure/bootstrap/agent-factory.ts` | 有 `assignmentDir` 時建立 overlay `PolicyLoader` 注入 `tutorGuideUseCase`；`ModeManager` 自動設 `tutor-guide` |
| `src/infrastructure/config/policy-loader.ts` | 新增 `overlayDir` 參數；`load()` 優先讀 `<overlayDir>/tutors/<mode>.md` |
| `src/application/use-cases/execute-tutor-use-case.ts` | `ExecuteTutorDeps` 加可注入的 `policyLoader?`；constructor 用 `deps.policyLoader ?? new PolicyLoader()` |
| `src/application/services/mode-manager.ts` | `constructor(initialMode?)` 可跳過 settings；有 assignment 時直接設為 `tutor-guide` |

---

## 架構流程

```
index.ts
  └─ parse --assignment <path> → resolveAssignmentDir()
       └─ startTUI({ directory, assignmentDir })
            └─ AppController
                 └─ createAgentController({ ..., assignmentDir })
                      └─ buildAgentDeps(..., assignmentDir)
                           ├─ ModeManager('tutor-guide')          ← 自動設模式
                           ├─ PolicyLoader(undefined, assignmentDir) ← overlay loader
                           └─ ExecuteTutorUseCase({ ..., policyLoader })
                                └─ policyLoader.load('tutor-guide')
                                     ├─ try: <assignmentDir>/tutors/tutor-guide.md  ← 優先
                                     └─ fallback: src/agent/tutor-guide.md
```

---

## 測試方法

### 單元測試（自動）

```bash
# 單跑新測試
npx vitest run tests/unit/infrastructure/policy-loader.test.ts

# 完整 suite（309 tests，全過）
npx vitest run
```

測試涵蓋：
1. built-in only — 找不到時回傳空字串（non-fatal）
2. overlay 載入 `CSDS-HW2/tutors/tutor-guide.md` 成功
3. overlay 比 built-in 優先
4. overlay 目錄中沒有對應 mode 的 `tutors/<mode>.md` → fallback built-in
5. built-in 與 overlay 都不存在 → 空字串

### 手動演練

```bash
cd mindy-cli

# Dev mode（不需要 build）
bun run mindy -- --assignment tests/fixtures/assignments/CSDS-HW2

# 或 build 後執行
bun run build
node dist/index.js --assignment tests/fixtures/assignments/CSDS-HW2
```

TUI 啟動後應看到：
```
Welcome to Mindy CLI! Assignment: CSDS-HW2 — tutor-guide mode active. /help for commands.
```

輸入任何問題後，LLM 將依 `tutors/tutor-guide.md` 中的規則回應（逐步提示，至少 3 個 Hint 後才給完整解答）。

### 錯誤處理確認

```bash
# 給一個不存在的路徑 → 應印出 helpful error 並 exit 1
node dist/index.js --assignment nonexistent-path

# 少給 argument → 應印出 error 並 exit 1
node dist/index.js --assignment
```

---

## 與 `.ai-tutor-config` 的關係（Phase 3 接軌）

目前 `--assignment` 接受的是**本地目錄路徑**（適合 dev/demo）。

根據 `2026-04-30-ai-tutor-login-init-design.md`，Phase 3 login 流程完成後，後端會下發 `.ai-tutor-config`，其中 `currentAssignment.id` 與 `currentAssignment.mode` 對應到本地的 assignment 目錄結構：

```json
{
  "currentAssignment": {
    "id": "HW2",
    "mode": "tutor-guide",
    "starterFile": "student-files/Hw2.Rmd",
    "specFile": "assignment/HW 02.docx.pdf"
  }
}
```

後續 Phase 3 實作時，`index.ts` 可改為：
1. 偵測 `.ai-tutor-config` 存在 → 自動帶入 `assignmentDir`（無需手動 `--assignment`）
2. 從 config 讀 `mode` 傳給 `ModeManager`，而非硬編碼 `'tutor-guide'`
3. `starterFile` / `specFile` 可作為初始 context 注入 system prompt

本次實作的介面（`assignmentDir`、`PolicyLoader` overlay、`ModeManager(initialMode)`）已為這個擴充預留了接合點，Phase 3 只需修改 `index.ts` 的解析邏輯，無需改動 application 層。

---

## 不在此次範圍內

- `.ai-tutor-config` 自動偵測（Phase 3）
- 學生認證 token 驗證
- `specFile` / `starterFile` 注入 system prompt
- submission endpoint 整合
