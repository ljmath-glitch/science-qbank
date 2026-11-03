#!/bin/bash
# 雙擊即可：開啟 AI 健檢橋接 + Tailscale 通道，並把「連線碼」複製到剪貼簿
cd "$(dirname "$0")/.." || exit 1
if /usr/sbin/lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "無法啟動 AI 橋接：連接埠 8790 已被其他程式使用。請先關閉該程式或改用其他連接埠後再試。"
  exit 1
fi
echo "== 啟動 Tailscale 通道 =="
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --https=8790 8790 2>&1 | head -5
echo "== 啟動橋接 =="
exec /opt/homebrew/bin/node tools/agy_bridge.cjs
