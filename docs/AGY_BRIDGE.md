# 本機 agy 橋接（AI 健檢改用你的 Antigravity，不耗 API token）

組卷精靈的「🔍 AI 健檢」預設呼叫 Gemini API。設定橋接後，改由你 Mac 上的 `agy`（Google AI Pro 訂閱）執行，透過 Tailscale 連回來。

橋接使用本機 `127.0.0.1:8790`，並由 Tailscale 以 `https://你的機器名稱.ts.net:8790` 提供 HTTPS。這個獨立連接埠刻意不使用 443、8443 或 8787，避免影響 ZiZi OCR service。

## 用法（最簡單）
1. 在 Mac 桌面雙擊「**啟動AI橋接**」（會開一個終端機視窗，保持開著）。視窗會顯示「連線碼」，並已複製到剪貼簿。
2. 回題庫網頁，組卷精靈第 3 步按「⚙ 本機橋接」，把連線碼貼上、按確定。只要做一次。
3. 之後只要要用 AI 健檢，就先雙擊「啟動AI橋接」。不用時關掉視窗即可。

- 第一次若 Tailscale 提示要開啟 HTTPS／MagicDNS，照它給的連結在管理頁勾選一次。
- 若啟動時顯示「連接埠 8790 已被其他程式使用」，請先釋放該連接埠再重試。
- 停用：按「⚙ 本機橋接」，留空按確定。

## 限制與安全
- 橋接只聽 `127.0.0.1`，對外只經 tailscale（tailnet 內）；每個請求都要帶 token，且只接受 `science-qbank.vercel.app` 與 localhost 來源。
- agy 以空目錄執行、prompt 要求只讀圖片檔、不寫檔不執行指令；一次只跑一題（約 10 秒/題）。
- 圖片：橋接會把題目附圖存成暫存檔，讓 agy 讀檔判讀（用完即刪），所以也能檢查圖片。
- Mac 要開機、橋接程式在跑，健檢才有作用；連不到時會顯示失敗，不影響出卷。

## 2026-11-03 更新：多引擎＋批次補齊題目明細
- 橋接現在支援 **agy／claude（Claude Code CLI）／codex（Codex CLI）**：`GET /engines` 回報這台電腦有哪些可用；`POST /ai` 可帶 `engine`（agy｜claude｜codex｜auto，預設 auto＝依序挑第一個有安裝的）。CLI 若未登入會回明確錯誤。
- Windows：雙擊 `tools/start_ai_bridge.bat`（需 Node.js）。沒有 Tailscale 時連線碼會是 `http://127.0.0.1:8790`，只適用同一台電腦的 Chrome。
- raw 自動匯題「題庫 Excel」步驟新增「🤖 本機 AI 補齊明細」：缺少冊數／冊名／領域／大單元／子單元／知識點／題目摘要的題目，分批（每批 8 題）交給本機 AI 補上，已有的欄位不動。
