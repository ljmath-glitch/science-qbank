# Science QBank

茲茲文教國中自然科題庫系統。這是直接部署到 Vercel 的靜態網站：HTML、JavaScript、CSS 與公開圖片必須保留在根目錄，因為它們同時是既有網址路徑。

| 位置 | 用途 |
| --- | --- |
| `index.html` | 題庫管理、匯入、詳解、組卷與 Word 匯出主系統 |
| `raw.html`、`raw-manual.html` | 考卷前處理與手動匯題流程 |
| `analytics.html`、`daily.html`、`progress.html` | 儀表板、每日一題與共編進度頁 |
| `paper-*.js`、`mt-embed-client.js` | 可重用的考卷輸出與數學工具模組 |
| `templates/` | Word 模板與模板資產 |
| `tools/` | OCR、去筆跡、橋接、模板建立與測試工具 |
| `docs/` | 規格、操作文件、整合說明與歷史交接 |
| `CLAUDE.md` | 完整技術架構、資料結構與維護規則 |

## 維護

- 不要任意移動根目錄的網站頁面、腳本、圖片或 manifest；它們由 Vercel 以同名 URL 提供。
- 修改功能時，同步更新 `guide.html`、`changelog.json` 與相關 `docs/` 文件。
- 提交前依 `CLAUDE.md` 的驗證流程檢查受影響頁面。
