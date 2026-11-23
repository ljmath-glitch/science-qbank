# 組卷預覽與 Word 差異清單

基準：`ZZExam.buildParts()`／`ZZExam.buildDocx()`。`sample-layouts.md` 僅供紙張、邊界與字型參考；不以舊樣本的浮動文繞圖作為規格。此表是實作追蹤表；「已解決」只表示程式已改用同一個規格來源，不代表已由 Microsoft Word 人工驗收。

| 項目 | 原本預覽 | 原本 Word | 改法 | 狀態 |
|---|---|---|---|---|
| 紙張與邊界 | 固定 A4/B4 px、B4 固定 1 cm | `ZZExam` 固定四邊 1 cm | `paper-layouts.js` 以 cm 定義，ABK A=1.27 cm、ABK B/K=1 cm | 進行中 |
| 內容寬度 | CSS/預覽另算 | OOXML `pgSz`／`pgMar` 另算 | 兩端讀 `contentWidthCm` | 進行中 |
| ABK 欄數與欄線 | 舊編輯預覽以 CSS columns | Word 第一段單欄、第二段雙欄 | 規格定義 `first/body/separator`，Word／Word XML 預覽讀取 | 進行中 |
| 黃金字級 | 舊預覽的字級不等於 Word | Word 通用題目樣式 12 pt | 黃金規格固定 8 pt，待接到產生器與預覽 | 待做 |
| 卷頭 | 舊 HTML 卷頭與 OOXML 繪圖卷頭不同 | `goldenHead`／`abkHead` | 預覽改使用 `ZZExam.buildParts()` 的同一份 XML | 已有，需讓編輯也走此路徑 |
| 頁首頁尾／頁碼 | 舊預覽自行組字串 | Word 使用 header/footer 與 PAGE 欄位 | Word XML 預覽已讀同一份 XML | 已有 |
| ABK 浮水印 | CSS pseudo-element | 頁首 anchor | Word XML 預覽已讀同一份 XML | 已有 |
| 題號、來源標籤、大題條、題組框 | 舊 HTML 各自渲染 | OOXML styles/shape | Word XML 預覽已讀同一份 XML | 已有，編輯模式待整合 |
| 行距、題距、不跨頁 | CSS 與 JS 分頁規則 | `ZXQ`／`keepLines` | 規格欄位已建立；待每題覆寫接線 | 待做 |
| 選項排列 | CSS grid，規則不同 | Tab（3000/5280/7560 twips） | `PaperLayouts.optionLayout()` 做唯一決策，Word 仍以 Tab 輸出 | 進行中 |
| 圖片大小與位置 | 舊 HTML 預覽可能保留浮動 CSS | `ZZExam` 一律 inline、置中段落 | cm→EMU，輸出 `wp:inline`；不產生 `anchor/wrapSquare` | 已解決 |
| 文字編輯／公式 | 舊 contenteditable 可編輯 | 匯出時轉成文字 | 保留既有 LaTex/MathType 流程，改成不離開同版面預覽 | 待做 |
| 分頁 | 舊預覽自行量測 | Word 實際分頁 | 瀏覽器可讀相同 XML，但無法保證與 Microsoft Word 字型度量 100% 相同 | 部分完成 |

## 驗收界線

## 模板逐項差異（第二階段）

| 檢查項目 | 茲茲正式版 | 茲茲正式版 ABK | 課前考 | 段考黃金模擬考 | 模考題本 | 詳解卷 |
|---|---|---|---|---|---|---|
| 資料／OOXML 來源 | `buildParts(formal)` | `buildParts(abk, formal)` | `buildParts(pre)` | `buildParts(golden)` | `buildParts(mock)` | `buildParts(solution)` |
| 紙張／欄 | A4、單欄 | B4、首段單欄後雙欄＋分隔線 | A4、單欄 | A4、單欄 | A4、單欄 | A4、單欄 |
| 卷頭 | 正式版共用卷頭 | 正式版共用卷頭；不使用舊 ABK 卷頭 | 課前考卷頭 | 黃金模擬考卷頭 | 題本封面／說明 | 詳解卷頭／答案表 |
| 頁首尾／題組／大題 | 同 XML 預覽 | 同 XML 預覽 | 同 XML 預覽 | 同 XML 預覽 | 同 XML 預覽 | 同 XML 預覽 |
| 圖片 | inline | inline | inline | inline | inline | 無題圖流程 |
| 已知限制 | 瀏覽器與 Word 可能有字型度量差 | 同左；舊 ABK 僅供 `legacyAbk:true` | 同左 | 同左 | 同左 | 同左 |

「正式版・黑白灰」就是 `style: formal`。舊的專屬 ABK 視覺（`abkHead`／`abkWatermark`）仍保留在程式中，但只接受明確的 `legacyAbk:true`，不列入以上對齊與測試範圍。

瀏覽器預覽與 Word 會共用資料、OOXML、尺寸、邊界、字級、欄數、圖片 cm 與 Tab 規則。瀏覽器無法執行 Microsoft Word 排版引擎，故最後的換行／跨頁仍必須由老師以 Microsoft Word 開啟人工確認；本專案不宣稱已做過該人工比對。
