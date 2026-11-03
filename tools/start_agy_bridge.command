#!/bin/bash
# 雙擊即可：開啟本機 AI 橋接 + Tailscale 通道，並把「連線碼」複製到剪貼簿
cd "$(dirname "$0")/.." || exit 1
NODE=/opt/homebrew/bin/node; [ -x "$NODE" ] || NODE=$(command -v node)
if /usr/sbin/lsof -nP -iTCP@127.0.0.1:8790 -sTCP:LISTEN >/dev/null 2>&1; then
  T=$(cat "$HOME/.science-qbank-bridge-token" 2>/dev/null)
  if /usr/bin/curl -s -m 3 -H "x-bridge-token: $T" http://127.0.0.1:8790/ping | grep -q '"ok":true'; then
    echo "AI 橋接已經在執行中，不用再開一次。"
    "$NODE" tools/agy_bridge.cjs --code
    echo; echo "（按 Enter 關閉此視窗；橋接仍會繼續執行，要停掉請到執行它的視窗按 Control+C）"; read -r _; exit 0
  fi
  echo "無法啟動 AI 橋接：連接埠 8790 被其他程式使用。請先關閉該程式後再試。"; read -r _; exit 1
fi
echo "== 啟動 Tailscale 通道 =="
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --https=8790 8790 2>&1 | head -5
echo "== 啟動橋接（這個視窗要保持開著）=="
exec "$NODE" tools/agy_bridge.cjs
