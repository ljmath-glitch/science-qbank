# 題庫 × 茲茲數學工具：插入／回編繪圖、數學式

題庫在「題目編輯視窗」與「組卷後的可編輯考卷預覽」可以開啟**茲茲數學工具**（課務系統提供的嵌入頁），
畫圖或打數學式，完成後帶回題庫；工具畫的圖之後還能**回編**（打開當初的設定再改）。

- 通訊格式（v1）以課務系統 repo 的 `docs/mt-embed-protocol.md` 為準；本文件只寫題庫端怎麼用。
- 題庫端程式：
  - `mt-embed-client.js`：開工具、收發 `postMessage`、驗證訊息（`window.MTEmbed`）。**工具網址只在這支檔案設定。**
  - `index.html` 的「茲茲數學工具整合」區塊：把結果存進題目（`mtEditInsertFig`、`mtEditFig`、`mtEditInsertEq`、`pvMtInsertFig`、`pvMtEditFig`、`pvMtInsertEq`）。
  - `uploadImgs()`：上傳 `data:` 圖到 Storage 後**只換 `src`，其他欄位全部保留**（寬度、對齊、位置 `x/y`、`mt`…）。

## 入口

| 位置 | 按鈕 | 目標 |
|---|---|---|
| 編輯視窗「圖片」區 | 📐 插入繪圖 | 依「加入：題目／題組文章」選單 |
| 編輯視窗「題組文章」區 | 📐 插入繪圖（題組共用圖） | 題組文章那一筆（`type:'passage'`） |
| 編輯視窗圖片列表／圖片子視窗 | 編輯繪圖（只有工具畫的圖才有） | 那一張圖 |
| 編輯視窗題目工具列 | 插入數學式 | 目前的文字框（題目／詳解／答案／題組文章） |
| 可編輯考卷預覽工具列 | 插入繪圖、編輯繪圖、插入數學式 | 先點一下某題或題組文章的文字（選取），直接回寫題庫原題／原題組文章 |

- 編輯視窗：新圖先放在編輯中的清單，按「儲存」時才上傳並寫入（跟其他圖片一樣）。
- 可編輯預覽：按「完成」後立刻上傳並寫回那一筆（沿用預覽「回寫題庫原題」的方式，不另存副本）。寫入失敗會還原畫面上的資料。
- 最後的匯出設定預覽（唯讀）沒有這些按鈕。
- 一般上傳／貼上的舊圖（沒有 `mt`）沒有「編輯繪圖」，行為跟以前一樣。

## 開啟方式

```
${TOOL_ORIGIN}/mt-embed.html?origin=${encodeURIComponent(location.origin)}&rid=${crypto.randomUUID()}&mode=fig|eq
```

- 預設開在題庫頁內的 iframe 視窗；右上角「在新視窗開啟」改用 `window.open`（Safari 若 iframe 內無法登入就用這個）。切換時會換一個新的 requestId，舊 iframe 的訊息一律不理。
- `TOOL_ORIGIN` 來自 `mt-embed-client.js` 的精確白名單 `TOOL_ORIGINS`：
  - `https://tzutzu-course-system.vercel.app`（正式，預設）
  - `http://localhost:8766`（本機開發）
- 要改連本機開發版：把 `TOOL_ORIGIN_OVERRIDE` 改成 `'http://localhost:8766'`（必須在白名單內，不接受萬用字元）。**上線前改回空字串。**
- 工具端也要把題庫的來源列入它的白名單（`mt-embed.html` 的 `ALLOWED` 與 `vercel.json` 的 `frame-ancestors`）；目前允許 `https://science-qbank.vercel.app` 與 `http://localhost:8765`。

## 訊息處理（摘要）

- 題庫送出：只有 `INIT`，且只在收到 `READY` 之後送一次；`targetOrigin` 一定是 `TOOL_ORIGIN`（不用 `*`）。
  - 新增繪圖 `data: {}`；回編 `data: { config, figureId }`（當初存的原樣送回）；數學式 `data: { latex }` 或 `{}`。
  - 不送題目內容、帳號、token、Supabase 金鑰或任何密碼。
- 收到的訊息必須全部符合才處理，否則忽略：`event.origin === TOOL_ORIGIN`、`event.source` 是自己開的 iframe／視窗、`source === 'tzutzu-math-studio'`、`v === 1`、`requestId` 相同、`type` 為 `READY/DONE/CANCEL/ERROR`。
- `DONE` 資料檢查（不合格＝當錯誤結束，不改資料）：
  - 繪圖：`png` 以 `data:image/png;base64,` 開頭、字串 < 11 MB、base64 字元合法；`width/height` 為正數；`figureId` 為 `[\w-]{1,80}`；`config` 為物件、`config.v === 1`、`config.t` 為字串、JSON < 500 KB。
  - 數學式：`latex` 字串 ≤ 20,000 字；外層 `$` 會去掉、換行改空白；內含未跳脫的 `$` 則拒收。
- `CANCEL`／`ERROR`／逾時／彈出視窗被關掉／上傳或寫入失敗：**一律不改資料**（`ERROR` 會顯示訊息）。
- 逾時：等 `READY`（含登入）10 分鐘；整個工作階段 60 分鐘（常數在 `mt-embed-client.js`）。

## 資料格式：`questions.imgs[i]`

```js
{
  src: 'https://…/storage/v1/object/public/question-images/{題目id}/{時間戳}_{序號}_{隨機碼}.png', // 公開網址，不含任何可編輯資料
  width: 60,          // 顯示寬度（% 版心寬）；新圖＝round(widthCm / 17 × 100)，限制在 20～100
  align: 'center',    // 新圖預設置中
  x: 20, y: 0,        // （選用）預覽拖曳後的位置；預覽插入的新圖會帶置中的 x
  mt: {               // 只有茲茲數學工具畫的圖才有
    v: 1,             // 題庫端 mt 欄位格式版本
    figureId: 'tzfig-…',
    config: { v: 1, t: 'triangle', p: {…}, style: {…} }, // 工具給的 config，原樣保存
    widthCm: 10.21,   // 工具建議的印出寬度（公分）
    pxW: 1206, pxH: 787 // PNG 像素（300 dpi）
  }
}
```

- 圖片存在 Supabase Storage bucket `question-images`，路徑規則與 `uploadImgs()` 相同（共用 `_uploadImgDataURL()`）。
- 題組共用圖存在 `type:'passage'` 那一筆（用它自己的 id 當路徑前綴），不會存在子題。
- 回編只換那張圖的 `src` 與 `mt`（`figureId` 沿用），其他欄位與其他圖片、順序都不變。
- 顯示一律只設寬度、高度自動，網頁預覽、HTML／列印 PDF、Word 都依原圖比例。
- 數學式不存在 `imgs`，直接以 `$latex$` 插進文字；插入點前後緊貼 `$` 時會自動加一個空白，避免變成 `$$`。

## 測試步驟（手動）

1. 開題庫 → 編輯一題 →「📐 插入繪圖」→ 登入工具 → 選一個工具畫圖 →「完成」→ 列表出現新圖（標「📐 數學工具繪圖」）→「儲存」。
2. 重新整理 → 再編輯同一題 → 那張圖有「編輯繪圖」→ 改參數 →「完成」→「儲存」：圖更新，寬度／對齊不變。
3. 再開一次工具，按「取消」或「關閉（不插入）」：題目沒有任何變化。
4. 有題組 ID 的題目 →「📐 插入繪圖（題組共用圖）」→ 儲存 → 同題組其他小題也看得到這張圖；回編同樣可行。
5. 題目文字框把游標放在某段 `$…$` 裡 →「插入數學式」→ 工具內是那段式子 → 改完「完成」→ 只換那一段；游標放在一般文字處則是插入新的 `$…$`。
6. 勾幾題 → 組卷預覽 → 點一下某題文字 →「插入繪圖」／「編輯繪圖」／「插入數學式」→ 關掉預覽再打開、或重新整理：改動已寫回原題。
7. 匯出 Word 與「預覽考卷 → 列印成 PDF」：工具圖比例正確、沒有變形。
8. Safari：iframe 內若無法登入，按「在新視窗開啟」。
