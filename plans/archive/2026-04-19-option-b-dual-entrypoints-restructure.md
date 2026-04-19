# Option B: Dual-Entrypoint Restructure

*Recorded: 2026-04-19 — decisions confirmed in session*

## Background

教授確認採用 Option B：讓 `index.ts` 作為 dispatcher 分流至 CLI 或 TUI，
兩個介面視為完全互斥的獨立路徑。

---

## 1. 現狀 (AS-IS)

```
index.ts  ← composition root + dispatcher + TUI spawner（身兼多職）
  │
  ├─ Commander subcommand (agent/ask/knowledge)
  │    └─ presentation/cli/agent-cli-adapter.ts   ← Presenter + Wiring 混在一起
  │         └─ application/controllers/agent-controller.ts  ← 名叫 controller 但放在 application 層
  │
  └─ 無子命令 → launchTUI()
       └─ child_process.spawn  ← out-of-process（不對稱）
            └─ presentation/tui/index.tsx
```

**問題**：
- TUI 是 out-of-process，CLI 是 in-process，兩條路徑不對稱
- `index.ts` 身兼 dispatcher + composition root + TUI spawner
- `AgentController` 放在 `application/controllers/`，名字誤導（它不是 MVC controller）
- `agent-cli-adapter.ts` 混了 Presenter 和 Wiring 兩種職責

---

## 2. 目標 (Option B TO-BE)

**只動 `cli/src/` 內的 entry 和 controller 結構；`domain/infrastructure/shared` 完全不動。**

```
cli/src/
  index.ts                      ← pure dispatcher（只決定走哪條路）

  cli/                          ← CLI 介面（新增此層）
    index.ts                    ← CLI composition root + wiring（新增）
    controller/
      cli-agent-controller.ts   ← CLI 專屬薄 controller（新增）
    presentation/               ← 現有 presentation/cli/ 搬過來
      agent-cli-presenter.ts    ← 改名自 agent-cli-adapter.ts（純渲染）
      ask-cli-presenter.ts
      rollback-cli-adapter.ts
      ...

  tui/                          ← TUI 介面（現有 presentation/tui/ 搬移）
    index.ts                    ← 現有 presentation/tui/index.tsx 搬過來
    controller/
      AppController.tsx         ← 現有，原地搬過來（TUI 專屬 controller）
    presentation/               ← 現有 presentation/tui/ 其餘檔案
      App.tsx
      components/
      event-mapper.ts
      types.ts
      ...

  application/
    services/
      agent-service.ts          ← AgentController 改名移過來（共用業務邏輯）
    use-cases/                  ← 不動
    ...

  domain/                       ← 不動
  infrastructure/               ← 不動
  composition/                  ← 不動
  shared/                       ← 不動
```

---

## 3. 三層 Controller 架構

Option B 後，controller 這個字出現在三個地方，各自職責不同：

| 檔案 | 層 | 職責 |
|---|---|---|
| `cli/controller/cli-agent-controller.ts` | CLI presentation | CLI 狀態（spinner）；call AgentService |
| `tui/controller/AppController.tsx` | TUI presentation | React state；call AgentService |
| `application/services/agent-service.ts` | Application | 共用業務邏輯：session、intent routing、use-case 呼叫 |

```
CLI 路徑：
  cli/index.ts
    → cli/controller/CliAgentController
        → application/services/AgentService
            → application/use-cases/*

TUI 路徑：
  tui/index.ts
    → tui/controller/AppController
        → application/services/AgentService
            → application/use-cases/*
```

**AgentService（原 AgentController）**包含：
- `initialize()` — session load/create
- `executeInstruction()` — intent routing → use-case 分派
- `executeAsk()` — ask pipeline
- `handleSlashCommand()` — slash command routing
- `prepareHistory()` — history summarization
- `emitTurnSaved()` — event emit

這些邏輯 CLI 和 TUI 共用，不重複。

---

## 4. 命名決定

| 舊名 | 新名 | 原因 |
|---|---|---|
| `application/controllers/agent-controller.ts` | `application/services/agent-service.ts` | 它是 application service，不是 MVC controller |
| `AgentController` class | `AgentService` class | 同上（backward-compat re-export 可保留） |
| `presentation/cli/agent-cli-adapter.ts` | `cli/presentation/agent-cli-presenter.ts` | 它只做渲染，不做 wiring；adapter 命名誤導 |
| `composition/create-agent-controller.ts` | `composition/create-agent-service.ts` | 配合改名（或保持不動減少 diff） |

---

## 5. `index.ts` dispatcher 邏輯

```ts
// src/index.ts（目標）
const isTUI = process.argv.length === 2; // 無子命令 → TUI
if (isTUI) {
    const { startTUI } = await import('./tui/index');
    await startTUI();
} else {
    const { startCLI } = await import('./cli/index');
    await startCLI();
}
```

`tui/index.ts` 已有 `export const startTUI()`，不需要 spawn，直接 import 呼叫。
`isDirectRun` guard 在 `tui/index.tsx` 可刪除（不再直接 spawn）。

---

## 6. 實作工作項目

| # | 工作 | 影響檔案 |
|---|------|---------|
| 1 | `AgentController` → `AgentService`，搬到 `application/services/` | 改名 + 移動 |
| 2 | 新增 `cli/controller/cli-agent-controller.ts`（薄 controller） | 新增 |
| 3 | 新增 `cli/index.ts`（CLI composition root + Commander wiring） | 新增 |
| 4 | `presentation/cli/` → `cli/presentation/`，`adapter` 改名 `presenter` | 移動 + 改名 |
| 5 | `presentation/tui/index.tsx` → `tui/index.ts` | 移動 |
| 6 | `presentation/tui/AppController.tsx` → `tui/controller/AppController.tsx` | 移動 |
| 7 | `presentation/tui/` 其餘 → `tui/presentation/` | 移動 |
| 8 | `index.ts` 改成 pure dispatcher（刪 spawn + launchTUI） | 修改 |
| 9 | 刪除 `tui/index.ts` 的 `isDirectRun` guard | 修改 |
| 10 | 更新所有 import 路徑 | 全面更新 |

---

## 7. 開放問題

1. **`composition/create-agent-controller.ts` 要不要跟著改名？**
   改名減少混亂，但 diff 更大。可以之後單獨做。

2. **`cli-agent-controller.ts` 薄到什麼程度？**
   只管 CLI 特有的狀態（spinner on/off？），還是完全不需要，直接在 `cli/index.ts` 呼叫 AgentService？

---

## 8. 相關檔案

- [index.ts](../cli/src/index.ts) — 目前 composition root
- [application/controllers/agent-controller.ts](../cli/src/application/controllers/agent-controller.ts) — 待改名為 AgentService
- [presentation/cli/agent-cli-adapter.ts](../cli/src/presentation/cli/agent-cli-adapter.ts) — 待改名為 presenter
- [presentation/tui/index.tsx](../cli/src/presentation/tui/index.tsx) — 已有 `startTUI()`
- [presentation/tui/AppController.tsx](../cli/src/presentation/tui/AppController.tsx) — 待搬到 tui/controller/
- [composition/create-agent-controller.ts](../cli/src/composition/create-agent-controller.ts) — 共用 factory
- [archive/2026-04-18-tui-bootstrap-extraction.md](archive/2026-04-18-tui-bootstrap-extraction.md) — 先前討論
