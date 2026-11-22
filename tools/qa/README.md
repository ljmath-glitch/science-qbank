# 題目品質關 v0

這是題庫匯入 JSON 的純規則檢查器，不使用 AI。輸入格式為 `{ "考卷名": [題目物件, ...] }`，題目可包含題庫匯入 Excel 的欄位，例如「題號」「答案」「題目」「圖表類型」「題組文章」「題組ID」。

```bash
python3 tools/qa/quality_gate.py _work/xl_test.json \
  --json-output _work/qa_report_v0.json \
  --markdown-output _work/qa_report_v0.md
```

輸出會包含每份考卷的題數、通過數、`block`、`warn`、規則統計，以及每題的 flags。`block` 代表不可啟用，`warn` 代表需要人工檢視。

目前規則：

- 題目或題組文章提到附圖、如圖、附表等，但「圖表類型」為「無」或空白。
- 選項不全／空白；一般選擇題要求 `(A)` 到 `(D)`，內容為正確／錯誤等的是非題要求 `(A)(B)`。
- 答案空白或超出選項範圍。
- 整份考卷的題號重複、跳號或缺號。
- 題組ID存在但子題沒有題組文章。
- 「試題結束」、頁碼／頁面標籤、連黏圖號等版面雜訊。
- 疑似遺失次方、下標或面積單位上標，以及 `\\mathrm{(C)...}` 類 LaTeX 選項標號格式。

執行測試：

```bash
cd tools/qa && python3 -m unittest -v test_quality_gate.py
```
