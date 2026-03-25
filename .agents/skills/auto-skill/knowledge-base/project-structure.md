## 🔧 專案目錄與檔案存放規則
**日期：** 2026-03-10
**情境：** 當 Agent 協助使用者進行專案架構規劃並產生規劃文件 (Plan File) 或 Gap Analysis 時。
**最佳實踐：**
- **Plan 檔案位置**：任何包含「規劃」、「架構分析」、「計畫」性質的文件（如 `AGENT_ARCHITECTURE_RUNTIME.md` 或後續的改版計畫），都**必須**存放在 `plans/` 資料夾中。
- **避免誤放**：這些有時效性或階段性任務的規劃文件，不應放於靜態的 `docs/` 文件資料夾中。在產生檔案時請務必確認路徑。

## 🔧 Package Manager: 使用 Bun 而非 npm
**日期：** 2026-03-25
**情境：** 本專案所有 CLI 開發、安裝、測試及腳本執行，均使用 Bun 取代 npm。
**最佳實踐：**
- **永遠使用 bun**：`bun install`、`bun run build`、`bun run dev`、`bun test`、`bun link`
- **不可使用 npm**：禁止在此專案使用 `npm install`、`npm run`、`npm test`、`npm link`
- **文件規則**：所有 `README.md`、`docs/user_guide/installation.md`、`cli/README.md` 中的安裝與開發指令皆應寫 `bun`，不寫 `npm`
- **CLAUDE.md 已記載**：`CLAUDE.md` 第 9 行有明確標示，是來源文件
- **安裝 Bun**：`curl -fsSL https://bun.sh/install | bash`（macOS/Linux）或查閱 https://bun.sh
