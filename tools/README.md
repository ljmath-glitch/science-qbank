# 工具導覽

| 位置 | 用途 |
| --- | --- |
| `dehand.js`、`models/` | 瀏覽器端去筆跡；模型可留在本機，正式載入有遠端備援 |
| `ocr-service/` | 公司／本機 OCR 服務與啟動指令 |
| `ocr-desktop/` | Windows 桌面 OCR 封裝與建置檔 |
| `agy_bridge.cjs`、`start_agy_bridge.command` | 本機 AI 健檢橋接 |
| `extract_question_assets.py`、`crop_scanned_exam_visuals.py` | PDF／掃描卷的題目與圖表裁切 |
| `build_*_template.py` | ABK、課前考、黃金模考模板重建工具 |
| `test_*.cjs`、`test_*.py` | 前端、Word 輸出與模板回歸測試 |

不要變更 `tools/` 的公開相對路徑；`raw.html`、`raw-manual.html` 與 iPad 測試頁會直接載入其中的檔案。
