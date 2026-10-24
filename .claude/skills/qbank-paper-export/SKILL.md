---
name: qbank-paper-export
description: 茲茲文教自然科題庫系統的組卷與考卷匯出（Word/HTML）功能。當使用者要匯出考卷、組卷、產生答案卷、改考卷表頭/版面、調整答案顯示模式、修 openPaperDlg／buildPaperInner／downloadWordDoc／generateAndDownloadWord、或處理題組文章與題號範圍顯示時使用。關鍵字：匯出、考卷、組卷、答案卷、詳解卷、Word、docx、HTML、表頭、ansMode、題號範圍、題組文章、選題CSV、autoMix、依比例自動選。
---

# 組卷與考卷匯出 SOP

處理 `index.html` 的匯出流程：`openPaperDlg()`（`index.html:3192`，開對話框並自動帶表頭）、`buildPaperInner()`（`index.html:3243`，組出考卷 HTML）、`downloadWordDoc()`（`index.html:5979`）／`generateAndDownloadWord()`（`index.html:5818`）。**核心原則：所有答案/詳解的顯示與否由 `ansMode` 單一變數決定；改版面改 `buildPaperInner`／`buildWordHtml`，改答案邏輯改各處對 `ansMode` 的判斷，六種模式要一起顧。**

## 前置：先有勾選題目
匯出前 `PICKS`（勾選集合）不能空，`openPaperDlg` 會擋（`index.html:3193`）。同題組子題會連動勾選。可先用「⚖ 依比例自動選」`autoMix()`（`index.html:3160`）在目前篩選下依難度比例隨機抽題。

## 六種答案顯示模式（ansMode，radio name=pAns，`index.html:756`）
| value | 意義 |
|---|---|
| `none` | 純題目，不附答案 |
| `end` | 純題目 ＋ 卷末附【參考答案】 |
| `inline` | 答案卷：每題附答案、無詳解 |
| `full` | 答案卷：每題附答案 ＋ 詳解 |
| `both` | 題目卷＋答案卷（無詳解）**同時下載兩個檔** |
| `both_full` | 題目卷＋答案卷（含詳解）同時下載 |

- `both`/`both_full` 在**預覽**時只顯示題目卷（`previewMode` 把它降成 `none`，`index.html:3247`）；實際下載時 `downloadWordDoc`/HTML 會分別產題目卷 + 答案卷兩檔（`solMode` = full/inline，`index.html:5971`、`5989`）。
- 加/改模式要同步改：radio 選項 HTML、`buildPaperInner` 的 `ansMode` 判斷（`index.html:3280-3282`）、`buildWordHtml`（`index.html:5731`）、`generateAndDownloadWord`（`index.html:5818`）、以及下載分流（`index.html:5963`起）。**漏改任一處會出現「預覽對但下載錯」或某模式沒答案」。**

## 表頭（buildExamHeader，`index.html:3233`）
- 四個欄位：年級 `pGrade`（國七/國八/國九或高中）、科目 `pSubject`、範圍 `pScope`、考試名稱 `pExamName`，`openPaperDlg` 會依目前篩選自動帶入合理預設（如冊數→第N冊，`scopeMap`）。
- 版面：左邊「年級+科目　範圍」，右邊考試名稱，含 `logo.png`。四欄全空則不顯示表頭。

## 題組處理（buildPaperInner）
- 同題組文章只印一次（`shownPassages` Set），並自動算出題號範圍印「閱讀下列敘述後，回答 X～Y 題」（`groupRanges`，`index.html:3252`、`3270`）。
- 題目依 `exam` 再 `no` 排序（`index.html:3244`）；`qNum` 是重新編過的連續卷面題號，不是原始題號。
- 填充題/計算題（`type` 為 `填`/`計`）在非答案模式會留手寫作答空白（高度 `_paperBlankH` 只存本次 session）。

## LaTeX / 圖片
- 題目/答案/詳解都會過 `fixLatex` + `applyRichMarks`，`$...$` 由 KaTeX 排版。若匯出後公式亂掉，先確認原題詳解遵守單錢字號規則（見 `qbank-sol-generate`）。
- 圖片來自 `it.imgs`（base64 或 Storage URL），Word 匯出時要內嵌。

## 選題 CSV
「選題CSV」把目前勾選題目匯出成 CSV，格式近似匯入格式但**多一個算好的「難度」欄**。可與 `qbank-csv-import` 對照欄序。

## 驗證
- 開 `index.html`，勾幾題（含一組題組）→ 開匯出對話框，六種模式各預覽/下載一次：確認 `both`/`both_full` 產出兩個檔、題組文章只出現一次且題號範圍正確、填充題有作答空白、答案卷答案/詳解齊全。
- 改完 `node --check` 驗語法，`git push` main 部署。
