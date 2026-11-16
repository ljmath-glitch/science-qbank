# 交接

## 2026-11-16
- 匯卷頁 OCR 主機列移除兩個下載按鈕，下載入口保留在教學頁。
- Windows 主機 ZIP 改為應用程式入口，外層為「茲茲主機安裝.exe」與 internal，下載頁改為雙擊安裝說明。
- 安裝包通過編譯、完整性與 PowerShell 語法檢查，尚未在全新 Windows 電腦上完整安裝測試。
- 安裝入口由 internal/install.ps1 執行安裝，原始 C# 放在 internal/ZiziHostInstaller.cs。