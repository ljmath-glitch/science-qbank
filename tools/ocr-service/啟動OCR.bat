@echo off
chcp 65001 >nul
rem 一鍵啟動 OCR 服務（玉承87）。雙擊本檔即可，視窗保持開著服務才會運作。
rem 引擎 auto = 有文字層自動用文字層引擎、純掃描才用 MinerU。要純 MinerU 改成 mineru。

cd /d "%~dp0"
set OCR_ENGINE=auto
set OCR_ALLOW_ORIGIN=*
set MINERU_CMD=C:\mineru-env\Scripts\mineru.exe

echo ============================================================
echo  正在啟動 OCR 服務...（引擎：%OCR_ENGINE%）
echo  看到 "Uvicorn running on http://0.0.0.0:8000" 就成功。
echo  這個視窗請「保持開著」；關掉視窗＝關掉服務。
echo ============================================================

C:\mineru-env\Scripts\python.exe app.py

echo.
echo 服務已結束。若上面有紅字錯誤，請把訊息截圖給 Claude。
pause
