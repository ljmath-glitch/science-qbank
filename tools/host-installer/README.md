# Windows 主機安裝包

安裝後，系統匣的更新圖示會於登入後檢查版本，之後每 30 分鐘檢查一次。使用者點通知或右鍵「更新到…」即可下載並啟動更新。離線時保留現有版本，下一輪再檢查。更新前請完成正在進行的考卷。

安裝包含 OCR、題庫 Excel、自動切圖和 AI 橋接。準備環境時會實際載入 PP-DocLayout v3，下載其模型。AI 工具和 Tailscale 帳號仍由使用者登入。

## 發布新版

1. 後端程式或模型改動放入 payload-overrides，目錄結構與原安裝包相同。也可以先更新 downloads/zizi-host-windows.zip 的基底內容。
2. 修改 version.json，遞增 version。模型變更時也更新 modelVersion，並在 payload-overrides 提供相應模型、下載設定或依賴。
3. 執行 Windows PowerShell 的 tools/host-installer/build.ps1 -Repo <專案路徑>。腳本會編譯、測試、重建 ZIP，再產生 downloads/host-update.json 的 SHA256。
4. 將原始碼、ZIP 和 host-update.json 一起提交到 main。已安裝 2.0.0 以上的使用者會收到通知。單純推送程式碼、未更新版本與 ZIP，不會觸發更新。

更新來源固定為此 GitHub repository 的 main。下載前後會檢查版本、SHA256、解壓縮路徑與套件入口。這是透過 HTTPS 與雜湊校驗的更新機制，EXE 尚未做 Windows 程式碼簽章。

## 安裝與恢復

各版本放在 LOCALAPPDATA/ZiziHost 的獨立目錄，使用獨立 Python 虛擬環境。主機名稱與 host-config.json 保留。準備依賴與切圖模型完成後才切換排程，成功通過健康檢查後記錄 installed.json。切換失敗會嘗試恢復舊服務，舊目錄與日誌保留。

目前自動化驗證涵蓋編譯、PowerShell 與 JavaScript 語法、版本比較、JSON 解析、SHA256、解壓縮路徑防護和套件入口。仍需在測試用 Windows 主機驗證完整安裝、系統匣通知與跨版本恢復。
