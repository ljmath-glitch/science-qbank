# 本機 agy 橋接（AI 健檢改用你的 Antigravity，不耗 API token）

組卷精靈的「🔍 AI 健檢」預設呼叫 Gemini API。設定橋接後，改由你 Mac 上的 `agy`（Google AI Pro 訂閱）執行，透過 Tailscale 連回來。

## 用法（最簡單）
1. 在 Mac 桌面雙擊「**啟動AI橋接**」（會開一個終端機視窗，保持開著）。視窗會顯示「連線碼」，並已複製到剪貼簿。
2. 回題庫網頁，組卷精靈第 3 步按「⚙ 本機橋接」，把連線碼貼上、按確定。只要做一次。
3. 之後只要要用 AI 健檢，就先雙擊「啟動AI橋接」。不用時關掉視窗即可。

- 第一次若 Tailscale 提示要開啟 HTTPS／MagicDNS，照它給的連結在管理頁勾選一次。
- 停用：按「⚙ 本機橋接」，留空按確定。

## 限制與安全
- 橋接只聽 `127.0.0.1`，對外只經 tailscale（tailnet 內）；每個請求都要帶 token，且只接受 `science-qbank.vercel.app` 與 localhost 來源。
- agy 以空目錄執行、prompt 要求不使用工具；一次只跑一題（約 10 秒/題）。
- agy 只收文字，**不看圖片**；要檢查圖片請改用 Gemini API（停用橋接）。
- Mac 要開機、橋接程式在跑，健檢才有作用；連不到時會顯示失敗，不影響出卷。
