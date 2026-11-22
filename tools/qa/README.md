# 題目品質關 v0.1

這是題庫匯入 JSON 的純規則檢查器，不使用 AI。輸入格式為 `{ "考卷名": [題目物件, ...] }`，題目可包含題庫匯入 Excel 的欄位，例如「題號」「答案」「題目」「圖表類型」「題組文章」「題組ID」。

```bash
python3 tools/qa/quality_gate.py _work/xl_test.json \
  --json-output _work/qa_report_v0.json \
  --markdown-output _work/qa_report_v0.md
```

輸出會包含每份考卷的題數、通過數、`block`、`warn`、規則統計，以及每題的 flags。`block` 代表不可啟用，`warn` 代表需要人工檢視。

v0.1 重點規則：

- 題目或題組文章提到附圖、如圖、附表等，但「圖表類型」為「無」或空白。
- 題型先分流：填充、計算與非選題不要求選項；接受五選一、複選答案及 O/X、○/✕、T/F、A/B 是非答案。全半形選項與答案會先正規化。
- 選項從題尾連續遞增的標號列切分，避免題幹 `(A)` 被當作選項。
- 題號嚴格為正整數，缺號／重複／亂序都寫在考卷層級；大題從 1 重編時不視為重複。
- 題組ID依整組判斷，只要任一子題有文章即合格。
- 「試題結束」、頁碼／頁面標籤、連黏圖號等版面雜訊。
- 題目、題組文章、詳解共用的雜訊與上下標檢查；頁碼僅在行首尾觸發，化學式／變數下標使用白名單，避免 A4、B12 誤報。

執行測試：

```bash
cd tools/qa && python3 -m unittest -v test_quality_gate.py
```

## 舊題庫唯讀掃描

準備 gitignore 的 `_work/old_q.ndjson`（每行一筆舊 `questions` 匯出）與
`_work/_img.txt`（每行一個有圖片的題目 ID）後，從專案根目錄執行：

```bash
python3 tools/qa/scan_old_db.py
```

可用 `--input`、`--images`、`--output-dir` 指定其他快照或輸出目錄。它不會寫入
資料庫，會產生 `scan_old_db.json`、繁中 `scan_old_db.md` 和
`scan_old_db_by_exam.csv`。題組文章會依 `group_id` 回填給子題；缺圖則以題目或
題組文章 ID 是否在 `_img.txt` 為準。

全部 QA 測試：

```bash
python3 -m unittest discover -s tools/qa
```
