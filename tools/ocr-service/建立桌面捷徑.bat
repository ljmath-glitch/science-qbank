@echo off
chcp 65001 >nul
rem 在桌面建立「題庫OCR服務」捷徑，指向 啟動OCR.bat。雙擊本檔一次即可，之後就從桌面圖示開服務。

powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $p=$w.SpecialFolders('Desktop')+'\題庫OCR服務.lnk'; $s=$w.CreateShortcut($p); $s.TargetPath='%~dp0啟動OCR.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\imageres.dll,109'; $s.Description='啟動題庫 OCR 服務'; $s.Save()"

echo.
echo 已在桌面建立捷徑「題庫OCR服務」。
echo 以後要開服務，雙擊桌面那個圖示即可（服務視窗保持開著）。
pause
