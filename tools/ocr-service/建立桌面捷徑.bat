@echo off
rem Create a Desktop shortcut ("qbank OCR") that points to 啟動OCR.bat.
rem Double-click this once; afterwards start the service from the Desktop icon.
chcp 65001 >nul

powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $p=$w.SpecialFolders('Desktop')+'\題庫OCR服務.lnk'; $s=$w.CreateShortcut($p); $s.TargetPath=(Join-Path '%~dp0' '啟動OCR.bat'); $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\imageres.dll,109'; $s.Description='Start qbank OCR service'; $s.Save()"

echo.
echo Desktop shortcut created. Check your Desktop for the icon.
echo Next time, just double-click that Desktop icon to start the service.
pause
