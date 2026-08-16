@echo off
rem ============================================================
rem  qbank OCR service launcher (double-click to start).
rem  Keep the window open; closing it stops the service.
rem  OCR_ENGINE=auto : text-layer PDFs use the text-layer engine,
rem  pure scans fall back to MinerU. Set to "mineru" to force MinerU.
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
set OCR_ENGINE=auto
set OCR_ALLOW_ORIGIN=*
set MINERU_CMD=C:\mineru-env\Scripts\mineru.exe

echo ============================================================
echo   OCR service starting...  engine = %OCR_ENGINE%
echo   Success = "Uvicorn running on http://0.0.0.0:8000"
echo   KEEP THIS WINDOW OPEN. Close it = stop the service.
echo ============================================================

C:\mineru-env\Scripts\python.exe 題庫OCR_server.py

echo.
echo Service stopped. If there is a red error above, screenshot it to Claude.
pause
