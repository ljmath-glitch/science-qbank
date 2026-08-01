# 考卷 OCR 後端服務 — 安裝與啟動 SOP

> 給完全不懂程式的人看。照著複製貼上即可。這台電腦＝「後端」，負責幫瀏覽器做 OCR 重工。
> 建議就裝在**大南路櫃2**那台（已經在跑 Ollama 的同一台）。

---

## 名詞 30 秒

- **這個服務** = 一個小程式，開著之後會在「這台電腦的 11500 埠」等瀏覽器來問。
- **前端**（題庫網站 raw.html）會把清稿 PDF 送來，服務用 **MinerU** 辨識完，把結果送回去。
- 跟 Ollama 一模一樣的概念，只是換成做 OCR。

---

## A. 先用「假資料模式」確認服務能開（5 分鐘，不用裝 MinerU）

這步是為了先確定「服務跑得起來、瀏覽器連得到」，用假資料，不會真的辨識。

1. 裝 Python（若已裝可跳過）：到 https://www.python.org/downloads/ 下載安裝，
   **安裝時務必勾選「Add Python to PATH」**。
2. 開「命令提示字元」(cmd)，切到本資料夾，安裝三個小套件：
   ```
   pip install fastapi "uvicorn[standard]" python-multipart
   ```
3. 啟動服務（假資料模式）：
   ```
   python app.py
   ```
   看到 `Uvicorn running on http://0.0.0.0:8000` 就成功了。
4. 測試：瀏覽器開 `http://localhost:8000/health`，看到 `"ok": true` 代表服務活著。

> 想換埠號：先 `set OCR_PORT=11500` 再 `python app.py`。

---

## B. 裝真正的辨識引擎 MinerU（純 CPU）

1. 安裝 MinerU（會下載較大，請耐心）：
   ```
   pip install "mineru[core]"
   ```
2. 第一次辨識時 MinerU 會自動下載模型檔（也不小，需網路）。
3. 用「真辨識模式」啟動服務：
   ```
   set OCR_ENGINE=mineru
   python app.py
   ```
   再開 `http://localhost:8000/health`，應看到 `"mineru_available": true`。

> **無顯卡（你們的情況）**：服務已預設 `-b pipeline`（CPU 模式）。每頁約數十秒屬正常。
> 之後若加了 NVIDIA 顯卡，設 `set MINERU_BACKEND=vlm` 可大幅加速（其餘不用改）。

---

## C. 讓別台電腦（走 Tailscale）連得到（比照 Ollama 三設定）

服務已經聽 `0.0.0.0`（對外），另外要處理：

1. **CORS 放行題庫網站**：預設已放行 `https://science-qbank.vercel.app`。
   要全放行可：`set OCR_ALLOW_ORIGIN=*` 再啟動。
2. **防火牆放行埠**：Windows Defender 防火牆 → 新增輸入規則 → TCP → 該埠（預設 8000）→ 允許。
3. **確認 Tailscale 開著、登入同一帳號**。別台電腦用「本機 Tailscale IP:埠」連（例：`http://100.72.250.96:8000`）。

> 混合內容限制同 Ollama：題庫是 https、本服務是 http，**請用 Chrome/Edge**（網址列鎖頭 → 網站設定 → 允許「不安全的內容」）。Safari/iPhone 不支援。

---

## D. 常見問題

| 症狀 | 解法 |
|---|---|
| `'python' 不是內部或外部命令` | 沒勾 Add Python to PATH；重裝或用完整路徑 |
| **`fast_langdetect ... lid.176.ftz cannot be opened for loading`**（辨識到最後一步才失敗） | **Windows 使用者名稱含中文/非英文**（如 `C:\Users\劉靜數學\...`）會讓這個舊元件打不開檔案。解法：把 MinerU 裝在**純英文路徑的 venv**再從那裡跑：`python -m venv C:\mineru-env` → `C:\mineru-env\Scripts\Activate.ps1` → `pip install "mineru[core]"`。模型已下載會沿用。 |
| `health` 顯示 `mineru_available: false` | MinerU 沒裝好，或 `mineru` 不在 PATH；重跑 B-1 |
| 別台電腦連不到 | 檢查防火牆埠、Tailscale 是否連線、用 IP 不是 localhost |
| 辨識很慢 | 無 GPU 正常；量大請考慮加顯卡或改雲端引擎 |
| CORS 被擋（403 / OPTIONS 失敗） | `set OCR_ALLOW_ORIGIN=*` 重啟，或確認網域拼對 |

---

## E. 這個服務回傳什麼（給工程參考）

`POST /ocr`（上傳 PDF）→ 回一包 JSON：`pages[0].markdown` 是整份 markdown（含文字、表格 HTML、`$...$` LaTeX、`<img>` 圖片引用），`pages[0].blocks` 是「markdown 內真的引用到」的圖（每張含 `name` 與 `image_b64`）。
前端（raw.html）拿到後，把 markdown 交給 Ollama/Gemini 做「分類填 23 欄」，圖依 markdown 位置對應到題號。

> MinerU 3.4.x 以 markdown 為主要輸出（跨版本穩定）；本服務刻意不解析各版本格式不一的 `content_list*.json`。
