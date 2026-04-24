# ESM / Bundler Migration Plan

**Date:** 2026-04-24  
**Goal:** Replace deprecated `moduleResolution: "node"` with `module: "ESNext"` + `moduleResolution: "bundler"` — the idiomatic Bun tsconfig.

---

## 背景

`tsconfig.json` 目前設定：

```json
"module": "commonjs",
"moduleResolution": "node"
```

`"node"` 是 `"node10"` 的別名，TypeScript 6.0 起標記為 deprecated，7.0 將停止運作。  
暫時以 `"ignoreDeprecations": "6.0"` 壓制警告，但根本解法是遷移至 Bun 慣用的 ESM 設定。

---

## 目標設定

```json
"module": "ESNext",
"moduleResolution": "bundler"
```

`"bundler"` 適合 Bun／Vite 等打包器：寬鬆的副檔名解析，支援 `exports` field，不強制 `.js` 副檔名。

---

## 影響分析

### 無影響
| 位置 | 說明 |
|------|------|
| `library-scanner.ts:72` | `require("${pkg}")` 在 R script 字串內，非 JS require |
| 所有 `import`/`export` 語法 | 本來就是 ESM，不需修改 |

### 需修改：`plugin-loader.ts`

**問題：** `loadOne()` 使用同步 `require(filePath)` 動態載入 plugin 檔。ESM 環境下動態載入必須用 `await import()`。

**修改方向：**

1. `loadOne()` → `loadOne(): Promise<AgentTool | null>`（async）
2. `require(filePath)` → `await import(filePath)`
3. `loadAll()` 已是 async，內部 `this.loadOne()` 加 `await` 即可
4. 呼叫端（`agent-service.ts` 或 presenter）已 `await loadAll()`，不受影響

**修改前（同步）：**
```ts
loadOne(filePath: string): AgentTool | null {
    let mod: unknown;
    try {
        mod = require(filePath);  // ← CJS
    } catch (err) { ... }
    ...
}
```

**修改後（async ESM）：**
```ts
async loadOne(filePath: string): Promise<AgentTool | null> {
    let mod: unknown;
    try {
        mod = await import(filePath);  // ← ESM dynamic import
    } catch (err) { ... }
    ...
}
```

> **注意：** Plugin 檔案本身（`~/.mindy/plugins/*.js`）目前文件說明使用 CJS 格式（`module.exports`）。  
> 遷移後，`import()` 仍可載入 CJS 模組（Bun 支援混用），但建議同步更新 plugin 撰寫說明為 ESM `export default`。

---

## 執行步驟

1. **修改 `plugin-loader.ts`**
   - `loadOne` 改為 async
   - `require()` 改為 `await import()`
   - 更新 JSDoc 中的 plugin 範例格式（CJS → ESM）

2. **修改 `tsconfig.json`**
   - 移除 `"ignoreDeprecations": "6.0"`
   - `"module": "commonjs"` → `"module": "ESNext"`
   - `"moduleResolution": "node"` → `"moduleResolution": "bundler"`

3. **修改 `tests/tsconfig.json`**
   - 移除 `"ignoreDeprecations": "6.0"`（警告來源已消除）

4. **執行測試**
   ```bash
   cd mindy-cli && bun run test
   ```

5. **執行建置**
   ```bash
   bun run build
   ```

6. **手動驗證**
   ```bash
   bun run mindy -- agent "test instruction"
   ```

---

## 風險與備援

| 風險 | 可能性 | 備援 |
|------|--------|------|
| 現有 CJS plugin 無法載入 | 低（Bun `import()` 支援 CJS） | 若失敗改回 `createRequire` 包裝 |
| 其他 `require()` 漏網 | 低（grep 確認只有 1 處）| 建置錯誤會直接報出 |
| Vitest 設定需調整 | 低（`vitest.config.ts` 未限制 module 格式）| 更新 `vitest.config.ts` 加 `environment: "node"` |

---

## 完成標準

- [ ] `bun run build` 無錯誤、無 deprecation 警告
- [ ] `bun run test` 全部通過（現有 119 tests）
- [ ] VS Code TypeScript 語言服務無 `moduleResolution` 相關警告
- [ ] Plugin 載入功能手動驗證正常
