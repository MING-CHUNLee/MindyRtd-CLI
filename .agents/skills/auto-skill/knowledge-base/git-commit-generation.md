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
