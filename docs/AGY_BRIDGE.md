# 本機 agy 橋接（AI 健檢改用你的 Antigravity，不耗 API token）

組卷精靈的「🔍 AI 健檢」預設呼叫 Gemini API。設定橋接後，改由你 Mac 上的 `agy`（Google AI Pro 訂閱）執行，透過 Tailscale 連回來。

## 一次性設定（在你的 Mac 終端機）

```bash
# 1. 啟動橋接（保持這個視窗開著；第一次會產生 token）
node ~/vibe-coding/science-qbank/tools/agy_bridge.cjs

# 2. 另開一個視窗：用 Tailscale 把它以 HTTPS 開放給你的 tailnet（只有你自己的裝置連得到）
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 8787

# 3. 看網址與 token
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve status
cat ~/.science-qbank-bridge-token
```

- `tailscale serve` 需要在 Tailscale 管理頁開啟 MagicDNS 與 HTTPS Certificates（第一次執行會提示連結）。
- 網頁在 https，所以橋接網址也必須是 https（`tailscale serve` 提供），不能用 `http://100.x.x.x`。

## 在網頁設定
組卷精靈第 3 步按「⚙ 本機橋接」，貼上 `https://…ts.net` 網址與 token。留空網址＝停用，改回 Gemini API。設定只存在該瀏覽器。

## 限制與安全
- 橋接只聽 `127.0.0.1`，對外只經 tailscale（tailnet 內）；每個請求都要帶 token，且只接受 `science-qbank.vercel.app` 與 localhost 來源。
- agy 以空目錄執行、prompt 要求不使用工具；一次只跑一題（約 10 秒/題）。
- agy 只收文字，**不看圖片**；要檢查圖片請改用 Gemini API（停用橋接）。
- Mac 要開機、橋接程式在跑，健檢才有作用；連不到時會顯示失敗，不影響出卷。
