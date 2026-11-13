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

## 已處理（2026-11-13）
已推 Boss-fu/exam-answer-key-formatter `main` b3458f3：`to_qbank_xlsx.py` 缺 openpyxl 時自動 `pip install`，`setup_env.ps1/.sh` 補上 openpyxl。
公司主機的 `auto-update.ps1` 每 5 分鐘快轉 main，之後第一次產生題庫 Excel 會先花幾秒補裝。
若主機本機有未提交修改，自動更新會略過（見 `local-app/output/auto-update.log`），此時仍需手動 pip install。
本機版 ZiziOCR.exe（PyInstaller 打包）不吃這個修正，要重新打包才會有 openpyxl。
