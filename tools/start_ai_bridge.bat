@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo 啟動本機 AI 橋接（需要已安裝 Node.js，以及 agy / claude / codex 其中之一）
node tools\agy_bridge.cjs
pause
