@echo off
chcp 65001 >nul
taskkill /IM ZiziOCR.exe /F >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ZiziOCR（背景）.lnk" >nul 2>&1
echo 已停止 ZiziOCR，並取消登入時自動啟動。
pause
