# 後端開發最佳實踐

此分類記錄後端開發相關的經驗和最佳實踐。

---

<!-- 新的經驗條目會自動添加在這裡 -->

## 🔧 現代 Fetch API 的 Timeout 最佳實踐
**日期：** 2026-02-28
**情境：** 在使用 Node.js (`node-fetch` 或原生 `fetch`) 串接後端 API 時，遇到要求設定超時但 TypeScript 提示 `'timeout' does not exist in type 'RequestInit'` 的錯誤。
**最佳實踐：**
- **棄用屬性設定：** 不要直接於 `fetch` 選項寫 `timeout: 3000`，現代標準已不支援此寫法。
- **改用 AbortController：** 實例化 `const controller = new AbortController();`，並用語法 `setTimeout(() => controller.abort(), 3000);` 觸發超時中斷。
- **綁定 Signal 控制權：** 於 `fetch` 中新增 `signal: controller.signal as any` 以讓請求能夠被中斷。
- **隨手釋放計時資源：** 請求成功後，在 `finally` 中加上 `clearTimeout(timeoutId)` 防止記憶體/程序殘留。
