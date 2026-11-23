# 組卷預覽與 Word 差異清單

基準：`sample-layouts.md`，以及 2026-11-23 讀取的 ABK A／B、JB5 精選卷 DOCX XML。此表是實作追蹤表；「已解決」只表示程式已改用同一個規格來源，不代表已由 Microsoft Word 人工驗收。

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
| 圖片大小與位置 | 百分比、預設 inline；手動浮動只在舊預覽 | `ZZExam` 一律 inline 置中 | 每張圖改存 cm + placement，Word 產生 `anchor/wrapSquare` | 待做 |
| 文字編輯／公式 | 舊 contenteditable 可編輯 | 匯出時轉成文字 | 保留既有 LaTex/MathType 流程，改成不離開同版面預覽 | 待做 |
| 分頁 | 舊預覽自行量測 | Word 實際分頁 | 瀏覽器可讀相同 XML，但無法保證與 Microsoft Word 字型度量 100% 相同 | 部分完成 |

## 驗收界線

瀏覽器預覽與 Word 會共用資料、OOXML、尺寸、邊界、字級、欄數、圖片 cm 與 Tab 規則。瀏覽器無法執行 Microsoft Word 排版引擎，故最後的換行／跨頁仍必須由老師以 Microsoft Word 開啟人工確認；本專案不宣稱已做過該人工比對。
