# OCR 主機「題庫 Excel 失敗（500）」原因與修法（2026-11-13）

## 症狀
自動匯題 Step 3 OCR 成功、Word 也能轉，但 Step 4「題庫 Excel」0.7 秒就回 500。

## 原因（讀程式碼判斷，尚未在主機上實跑確認）
- 主機的 `/api/py-ocr/qbank-xlsx`（Boss-fu/exam-answer-key-formatter `local-app/server.js`）用 `pyBin()`＝`%USERPROFILE%\.venvs\zizi-exam` 執行 `ocr/to_qbank_xlsx.py`。
- `to_qbank_xlsx.py` 第 11 行 `import openpyxl`。
- 但建環境的 `ocr/setup_env.ps1`／`setup_env.sh` 只裝 `ocr/requirements.txt` + `python-docx rapidfuzz`，**沒有 openpyxl**；`ocr/requirements.txt` 也沒有。
- Word 用的 `to_zizi_word.py`／`buildlib.py` 只需要 python-docx、Pillow，所以 Word 正常、Excel 失敗。

## 立即修法（在 OCR 主機上，免重跑 OCR）
```
%USERPROFILE%\.venvs\zizi-exam\Scripts\python.exe -m pip install openpyxl
```
裝完回到網頁按「🔁 重試抓 Excel」。

## 根治（要改 exam-answer-key-formatter repo）
- `ocr/setup_env.ps1` 第 34 行、`ocr/setup_env.sh` 第 16 行的 `python-docx rapidfuzz` 後加 `openpyxl`，並把 `openpyxl` 加進最後的 import 檢查。
- 或直接在 `ocr/requirements.txt` 加 `openpyxl>=3.1`。

## 前端（science-qbank raw.html）已做
500 時讀出主機錯誤，偵測到 `No module named 'xxx'` 會直接顯示上面的安裝指令；另提供 Gemini／複製指令／重試備援。
