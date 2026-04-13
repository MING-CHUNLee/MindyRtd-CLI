## 🔧 從大量變更生成且提交有意義的 Git Commit
**日期：** 2026-03-05
**情境：** 開發過程中有超過數十個檔案的大量變更，需要快速掌握上下文並進行明確歸納的語義化提交（Semantic Commit），可作為 AI Agent 自動化整理 Commit 的輔助工作流。
**最佳實踐：**
- **第一步：檢查狀態與取得變更內容**
  1. 使用 `git status` 判斷哪些檔案已經新增、修改或是未追蹤（Untracked）。
  2. 若變更可能過多（超過千行以上），可將 diff 輸出到一個暫存檔中（例如 `git add -N . && git diff > diff.txt`），再用檔案讀取工具分頁查看。這將比讓終端機吐出一大串難以閱讀的文字好。

- **第二步：分析與總結並依照 Conventional Commits 撰寫訊息**
  1. 將暫存的 Diff 變更按功能或模塊進行分類與解析。
  2. 將提交的完整訊息輸出至獨立的純文字檔（如 `commit_msg.txt`），方便反覆修改確認。
  3. 強制首行為短潔精要的標題（例如：`feat: implement conversational memory and context management`），空一行後條列式具體說明每個重點檔案的變更動機與技術實作。

- **第三步：加入追蹤並提交**
  1. 執行 `git add .` 將所有整理好的變更加入 staged。
  2. 執行 `git commit -F commit_msg.txt`，從文字檔直接導入提交描述，避免複雜或多行的字元被 Shell 截斷。
  3. 完成後刪除暫存用途的 `diff.txt` 與 `commit_msg.txt`。

- **附註：修補提交**
  若是後續發現剛剛提交少放了某個檔案（例如忘記排除剛剛的 .txt 檔），可以事後補上然後執行：`git commit --amend --no-edit`。此法適合連續型開發或自動化操作的收尾修正。

---

## 🔧 終端機 diff 截斷時，改用「讀檔理解架構意圖」寫 Commit
**日期：** 2026-03-21
**情境：** `git diff HEAD` 在終端輸出被截斷（行太長、顏色控制碼混入），無法直接閱讀 diff 內容。需改用讀取原始檔的方式理解變更意圖，再撰寫語義化 commit message。
**最佳實踐：**
- **第一步：快速取得變更概況（不直接讀 diff 內文）**
  1. 執行 `git diff HEAD --stat` — 取得每個檔案的 insertion/deletion 數量，判斷主要變更重心。
  2. 執行 `git status` — 確認新增（new file）、修改（modified）、staged 狀態。

- **第二步：直接讀取新增 / 重大修改的檔案**
  1. 對 `new file` 類型：直接用 `view_file` 讀取整個新檔案，理解其類別設計與職責。
  2. 對 `modified` 且變更行數多的檔案：同樣 `view_file` 全讀，搭配閱讀 JSDoc / 函式簽名了解架構意圖。
  3. 此做法比解析截斷的 diff 更能理解「**為什麼改**」，而非只是「**改了什麼**」。

- **第三步：依架構意圖撰寫 Conventional Commit**
  1. 標題行：`type(scope): 一句話描述核心架構決策`（例：`refactor(edit-pipeline): extract FileEditTool...`）
  2. Body：分點描述每個子系統的變更，強調「設計原則」（如 SoC、DI、pipeline 模式）而非羅列行號。
  3. Footer（選擇性）：若此次無行為變更，加上 `No behaviour change; ...` 說明安全性。
  4. 直接以 `git commit -m "..."` 多行字串提交，無需暫存至 txt 檔（適合中等規模變更）。

- **適用場景：**
  - 重構類 PR（主要是類別抽取、責任轉移、依賴注入）
  - diff 行數不多但意圖深、終端截斷導致 diff 不可讀
  - 需要從「架構層面」描述提交，而非逐行說明

---

## 🔧 使用者偏好：預設生成簡短版 Commit Message
**日期：** 2026-04-12
**情境：** 每次從 git diff 生成 commit message 時，使用者提供兩個版本（完整版 vs 簡短版）後，一律選擇簡短版。
**最佳實踐：**
- **直接優先生成簡短版**，無需每次都同時提供兩個版本讓使用者選擇。
- 簡短版格式：`type(scope): 一句話摘要核心變更`，body 限 2–4 行條列重點，不超過 5 個 bullet。
- 若變更真的非常複雜（跨層架構 + 多模組），才額外提供一個「詳細版」供選擇，並標明「如需完整版可切換」。
- **不需要**撰寫 Footer（`No behaviour change` 等）除非使用者主動要求。
