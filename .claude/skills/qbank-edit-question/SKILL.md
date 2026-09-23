---
name: qbank-edit-question
description: 茲茲文教自然科題庫系統的手動新增／編輯單題 SOP 與欄位填寫規範。當使用者要手動新增題目、編輯單題、修 openEdit／saveEdit、處理圖片上傳（Ctrl+V 貼圖／拖拉調整）、LaTeX 即時預覽、難度評分、題組ID 綁定、或題組文章存檔時使用。關鍵字：新增題目、編輯、editDlg、openEdit、saveEdit、貼圖、圖片上傳、uploadImgs、LaTeX、難度、步驟分、記憶分、概念分、題組、groupId、題組文章、待確認、flag。
---

# 手動新增／編輯單題 SOP

處理 `index.html` 的編輯對話框：`openEdit()`（`index.html:2294`，載入題目到表單）、`saveEdit()`（`index.html:2310`，存回 Supabase）。**核心原則：欄位值都取自 DOM 表單、存前 trim；題組文章是「另一筆 type=passage 記錄」跟子題共用 groupId、要分開 upsert；圖片先上傳 Storage 換 URL 再存。改欄位要同時顧 openEdit 讀入與 saveEdit 寫出兩端。**

## 表單欄位對應（openEdit 讀 / saveEdit 寫）
| 表單 id | 欄位 | 備註 |
|---|---|---|
| `eYear` `eSchool` `eExam` `eExamRound` `eNo` `eAns` | year/school/exam/題別/no/ans | `eExam` 由 `composeExam()` 依年級+場次+冊別科目自動組（`index.html:2147`） |
| `eBook` | book | 選冊數後 `syncByBook` 自動帶 `bookName` 與 `field`（不是手填） |
| `eUnit` `eSub` | unit/sub | 連動下拉，依冊數/課綱骨架 |
| `eKp` `eSummary` `eType` `eChart` | kp/summary/type/chart | type 見 QTYPES 17 類；chart 見圖表類型 12 類 |
| `eStep/eMem/eCon`（`diff` 物件） | step/mem/con | 難度分，見下 |
| `eBasis` `eFlag` | basis/flag | 見「待確認」 |
| `eGroupId` | groupId | 綁題組，見下 |
| `eQ` `eSol` | q/sol | 題目/詳解，含 `$...$` LaTeX，KaTeX 即時預覽 |
| `ePassage` | 題組文章 | gid 有值才顯示，存成獨立 passage 記錄 |

## 難度評分（calcDiff，`index.html:1588`）
- `步驟分+記憶分+概念分` 加總；**三項只要有一項是 0 就視為「未評分」**（`if(!s||!m||!c)`）。
- 1~4 簡單／5~6 中等／7~8 困難／9+ 極難。三段式按鈕 `paintSeg()` 即時顯示。

## 待確認 flag（saveEdit 的 basis 特殊處理）
- 勾 `eFlag` 且 `basis` 有內容但不以 `[回報]` 開頭時，saveEdit 會自動在前面補 `[回報] `（`index.html:2315`）。
- `flag=true` 且 `basis` 開頭 `[回報]` 的題會出現在右上角鈴鐺通知（見 `CLAUDE.md` 6.7）。標題有問題時用這個機制，不要另開欄位。

## 題組（groupId）與題組文章
- `eGroupId` 有值 → 顯示題組文章區與圖片目標切換（`imgTargetWrap`）。
- saveEdit 存**兩筆**：子題本身，加一筆 `type='passage'`（`psRow`，`index.html:2332`）——共用 group_id，其他欄位留空、`flag:false`。存後同步更新本地 `PASSAGES[gid]` 免整庫重載（`index.html:2337`）。
- 題組文章的圖片與子題圖片分開（`curPassageImgs` vs `curImgs`），各自上傳。

## 圖片處理
- 貼圖（Ctrl+V）/上傳/拖拉調整大小與位置；`curImgs` 存 `[{src, width}]`。
- saveEdit 前呼叫 `uploadImgs(curImgs,id)`：把 base64 → 上傳 Supabase Storage `question-images` bucket → 換成公開 URL 再存，省 DB 空間（`index.html:2322`）。舊資料可能仍是 base64 直存。

## 存檔後行為（別誤加整庫重載）
- saveEdit 只 `upsert` 這一筆、`precompute(data)` 重算派生欄位、更新本地 `DB` 陣列該筆、`sortDB()`、`buildFiltersKeep()`、`render()`——**不 `load()` 整庫**，所以存完立即看到更新（`index.html:2341-2347`）。改這段別退回全庫重載，會慢又閃爍。

## 驗證
- 新增題必須 `q` 或 `summary` 至少一個非空，否則擋（`index.html:2319`）。
- 實測：新增一題含 `$...$` 公式與貼一張圖 → 存 → 確認列表即時出現、公式渲染正常、圖片變成 Storage URL；再開一題綁 groupId 填題組文章 → 確認 `PASSAGES` 有該組。
- 改完 `node --check` 驗語法後 `git push` main 部署。
