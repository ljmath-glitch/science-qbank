# 考卷前處理：運算方式三模式設計

## 1. 目的與已知事實

- 目標：`raw.html` 的使用者不必安裝 Tailscale 也能完成本機 OCR；已裝者仍可用 Mac／公司電腦的引擎。
- 現況：`raw.html` 的 `OCR_PRESETS` 為 `local`、`mac`、`company`；UI 目前預設 Mac／公司，實際流程呼叫遠端 `/api/py-ocr/start`、輪詢 progress，並下載 Word、原文、題庫 Excel。
- 現況：去筆跡已在瀏覽器，以 `tools/dehand.js` 載入 `onnxruntime-web@1.20.1`（優先 WebGPU、退回 WASM），逐頁 tile 處理；兩個現有模型各約 **10.5 MiB**（`handwriting-eraser-v10.onnx`、`jwmask-r8.onnx`）。
- 現況：Python OCR 端為 PP-OCRv5 路徑（`ocr/models/det.onnx`、`rec.onnx`、`ppocrv5_dict.txt`），另有清稿、雙欄／題號與題組切分、表格／圖處理、`exam_to_word.py`、`to_qbank_xlsx.py`。local-app 的 `/api/health` 已宣告 PP-OCRv5、本機 OCR、Word、Excel 能力。
- 現況：外部 repo 的 Electron `desktop/` 是未簽章薄殼；內容包含 `ocr/`、`local-app/`，內容包 SHA-256 驗證、原子切換、啟動及每 6 小時檢查更新。Mac `minShell` 不足時引導重裝；Windows 更新未簽章 NSIS 殼。
- **假設**：PP-OCRv5 的 `det/rec` ONNX 可在瀏覽器以目前/升級後的 onnxruntime-web 跑通；須以實際模型 I/O、動態 shape、字典及樣卷驗證，未驗證前不可宣稱品質等同 Python。

## 2. 使用者可選的運算方式

| 模式 | 執行位置／適用情境 | 可做與不能做 | 主要限制 |
|---|---|---|---|
| 瀏覽器內 | 模型自 CDN 下載、Cache Storage/IndexedDB 快取；無服務、可離線重跑 | 現可去筆跡、PDF render、檔名；目標可做 OCR 文字／框、基本題號切分與 CSV 預覽。Word、現行題庫 Excel、複雜版面規則須移植 JS/WASM 或暫不提供 | 首次下載與記憶體；Safari/WebGPU 差異；公式、表格、雙欄、低品質掃描品質風險最高 |
| 本機引擎 | 使用者自己的桌面版或 localhost 服務；完整 Python 模型與流程 | 完整清稿、PP-OCRv5、版面切題、Word、題庫 Excel；檔案不離開本機 | 首次安裝內容包/Python；HTTPS 頁直接 fetch HTTP localhost 有 mixed-content 問題 |
| 遠端電腦 | 現有 Mac／公司電腦，以 Tailscale private HTTPS `:8443` | 與本機引擎同等完整流程 | 僅已登入同 tailnet、主機開機且服務健康；不得改 Funnel/public 暴露 |

## 3. 瀏覽器內 OCR 的可行性與邊界

1. **可行核心**：PP-OCR 一般由 detector + recognizer + 字典組成；ONNX 與純影像 tensor 前後處理可搬至 Worker，ORT Web 可用 WebGPU、WASM fallback。應採「每頁／每行」串流及 transferable `ImageBitmap`，不一次保留整卷 RGBA/tensor。
2. **模型量級**：本 repo 未記錄 `det.onnx`、`rec.onnx` 的精確檔案大小；manifest 應以發佈產物的 `bytes` 為準。預留 detector、recognizer、字典及 ORT WASM 合計數十 MB 至百 MB 級的首次下載、解壓/執行記憶體；低 RAM 手機要警告並可改選引擎。
3. **速度預期（假設，待 benchmark）**：桌機 WebGPU 可望適合逐頁 OCR；WASM、Safari 與行數多的掃描卷可能達數十秒/頁或記憶體失敗。不可拿 Python CPU 的速度或準確率推論瀏覽器結果。
4. **品質風險**：中文字典、resize/normalize、det box 排序、角度校正、CJK decoding 必須逐項對齊 `ppocr_engine.py`；公式、圖表、跨欄閱讀順序、淡字與手寫殘留仍需人工覆核。先以既有 holdout 考卷做字錯率、題號、題界、表格保留率的門檻測試。
5. **仍屬 Python 的邏輯**：`pyexam.py` 的雙欄/題組/題號規則、清稿與圖表判定、Word 組版，以及 `to_qbank_xlsx.py` 的欄位修正和 xlsx 寫出；可逐步移植「OCR JSON → 題目 JSON」與 CSV，Word/XLSX 初期留給本機／遠端引擎。

## 4. 模型託管、manifest 與更新

### 4.1 選擇

| 位置 | 大小/成本/快取 | 結論 |
|---|---|---|
| Vercel 靜態 | 適合小型網站資產、CDN 快取方便；大型公開模型會消耗頻寬/方案額度且部署產物限制需依當期方案驗證 | 不作主要模型倉庫；可只放 manifest/前端 |
| Supabase Storage | 可控 bucket/CDN、可計量儲存與 egress；需管理額度與公開 bucket | 適合日後要自管帳務/網域的備選 |
| GitHub Releases | 現有 desktop 已採用；版本化、公開直連、適合 zip/內容包；下載量與 CDN 行為受 GitHub 政策 | **桌面內容包與固定版 ONNX 的首選** |
| Hugging Face | 模型導向版本、range/download cache、適合多檔大型公開權重；需管理公開 repo 與流量政策 | **瀏覽器 PP-OCR 模型的首選**；GitHub Release 作鏡像/災難備援 |

- 建議：前端與 immutable manifest 放 Vercel；公開模型置 Hugging Face（版本 tag/commit 固定 URL），桌面 `content-*.zip` 延續 GitHub Releases。服務 worker 以版本化 URL 配 `Cache-Control: public, max-age=31536000, immutable`；manifest 短快取（例如 5 分鐘）。
- 使用者已決定公開既有模型；包含 `tools/models/jwmask-r8.onnx`，本設計不移除也不重新評估授權。

### 4.2 `models/manifest.json` 契約（示例；hash/大小為發版時計算，非現值）

```json
{"schema":1,"channel":"stable","generatedAt":"2026-11-03T00:00:00Z","models":[
 {"id":"dehand-v10","version":"10.0.0","sha256":"<64-hex>","bytes":11039008,"url":"https://.../handwriting-eraser-v10.onnx"},
 {"id":"dehand-r8","version":"8.0.0","sha256":"<64-hex>","bytes":11037630,"url":"https://.../jwmask-r8.onnx"},
 {"id":"ppocrv5-det","version":"<locked>","sha256":"<64-hex>","bytes":0,"url":"https://.../det.onnx"},
 {"id":"ppocrv5-rec","version":"<locked>","sha256":"<64-hex>","bytes":0,"url":"https://.../rec.onnx"},
 {"id":"ppocrv5-dict","version":"<locked>","sha256":"<64-hex>","bytes":0,"url":"https://.../ppocrv5_dict.txt"}
]}
```

- 啟動時取 manifest；已快取的「完整 `id+version+sha256`」立即可用，下載候選檔後以 Web Crypto SHA-256 驗證，成功才原子寫入新 key；失敗保留上一版並提示重試。
- 背景只預抓下一版，不中斷工作；使用中 session pin 版本，結果記錄 `engineVersion`/model hashes。設「清除離線模型」與儲存空間提示；不得以可變 URL 覆寫已驗證快取。

## 5. 統一介面與選擇策略

```ts
interface EngineAdapter {
  id: 'browser'|'local'|'remote';
  detect(): Promise<{available:boolean; reason?:string; capabilities:string[]}>;
  health(): Promise<{ok:boolean; version?:string; capabilities:string[]}>;
  run(step:'dehand'|'ocr'|'word'|'qbank-xlsx', input:File|Blob|object,
      onProgress:(p:{phase:string; current?:number; total?:number; message:string})=>void): Promise<object>;
}
```

- Browser adapter：直接呼叫既有 `Dehand`，新增 Worker OCR；`word`/`qbank-xlsx` 回傳明確 `unsupported`，UI 改提供 CSV 下載及切換引擎。
- Local/Remote adapter：包住既有 `/api/health` 與 `/api/py-ocr/*`；回傳統一的文字、下載 blob/URL、模型/服務版本，避免 `raw.html` 依 mode 分支輪詢碼。
- UI：在 OCR 區加「運算方式」三個 radio（顯示能力、模型大小、是否送出檔案）；保留 Mac／公司作「遠端電腦」子選項，預設為目前 Mac。
- 自動偵測：記住使用者明確選擇；首次/選「自動」依 **本機桌面健康 → 遠端預設 Mac → 公司 → 瀏覽器可用且模型已下載/可下載**。使用者選 Browser 時不可靜默上傳到任何引擎；不可用時呈現可點選的替代方案與原因。

## 6. localhost、錯誤與安全

- Safari 會阻擋 HTTPS 網頁呼叫 `http://localhost`（mixed content）；提供三條路：**(a)** 桌面版內嵌頁面（同為 `http://127.0.0.1`，首選）、**(b)** 本機服務配置受信任 localhost HTTPS 憑證，**(c)** 明示改用 Chrome/Edge 並由使用者允許不安全內容。不可假設 Safari 可用 HTTP localhost。
- 遠端仍用現有 Tailscale HTTPS。現有 `cors.js` 已 exact-origin allowlist、僅 GET/POST/OPTIONS 與有限 headers；延續且把正式 raw 網域、桌面 origin 納入設定，禁止 `*`（開發模式除外）。
- localhost 綁 `127.0.0.1`、隨機 token/loopback session；遠端要求 Tailscale 身分外，再沿用/補齊登入 token 與角色。health 不洩漏路徑、環境與模型下載憑證。
- 限制 Content-Type PDF/圖片、檔案大小、頁數、解壓/渲染像素、併發與單 job 時限；server 以暫存 job ID 隔離並 TTL 清理。錯誤文案：`找不到本機引擎（開啟桌面版）`、`Safari 不支援 HTTP localhost（開啟桌面版／改 Chrome）`、`遠端主機離線（改用瀏覽器內）`、`模型驗證失敗（未啟用新版本）`。

## 7. 分階段實作、驗收與衝突順序

| 階段 | 變更範圍 | 風險與驗收 |
|---|---|---|
| P0（先完成） | 本文件；盤點 raw/local-app/desktop/ocr | 架構審核，無行為改變 |
| P1 | 新增 engine adapter（建議 `tools/engine-adapters.js`）與 raw mode UI；Remote 行為封裝後需與現況完全相同 | Mac/公司 health、OCR、Word、xlsx 冒煙測試；不動去筆跡檔 |
| P2 | 模型 manifest、下載器、Cache/sha256、Browser adapter 只接既有 Dehand | 斷網後清稿可重跑；hash 不符不覆寫舊快取 |
| P3 | PP-OCR browser Worker：先 det/rec、字典與 Python 對照測試；輸出 OCR JSON/CSV preview | holdout 逐頁 benchmark；WebGPU/WASM/Chrome/Safari 記憶體與品質門檻均達標才開預設 |
| P4 | 將題號/雙欄等純規則移植；保留人工覆核；Browser CSV | 題數、題號、閱讀順序、圖表題屬性比對 Python 基準 |
| P5 | 桌面/localhost HTTPS 或內嵌頁面、服務 token/CORS/限制；Word/XLSX 完整本機模式 | Safari、Chrome、Windows/Mac 安裝/更新與安全測試 |

- **與進行中的去筆跡任務的衝突**：`tools/dehand.js`、`tools/models/` 正在被另一任務修改；P1/P2 不應觸碰它們或複製其載入邏輯。待該任務合併並驗收其公開模型 URL/版本後，再由 P2 把最終檔名、hash、大小寫入 manifest。
- **建議順序**：先完成並穩定去筆跡 → P1 不改 dehand 的 adapter/UI 骨架 → P2 manifest → P3 瀏覽器 OCR 實驗；遠端與桌面完整能力始終保留，瀏覽器 OCR 不以未驗證結果取代它們。
