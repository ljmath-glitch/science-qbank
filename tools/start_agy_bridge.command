#!/bin/bash
# 雙擊即可：開啟 AI 健檢橋接 + Tailscale 通道，並把「連線碼」複製到剪貼簿
cd "$(dirname "$0")/.." || exit 1
echo "== 啟動 Tailscale 通道 =="
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 8787 2>&1 | head -5
echo "== 啟動橋接 =="
exec /opt/homebrew/bin/node tools/agy_bridge.cjs
