# 交接

## 已完成（2026-11-16）
- 匯卷頁主機列移除下載按鈕，下載入口位於教學頁。
- Windows 安裝包 2.0.0 採用 EXE 與 internal 結構，含 OCR、Excel、自動切圖。
- 安裝時實際初始化 PP-DocLayout v3，自動準備模型。
- 系統匣每 30 分鐘讀取 GitHub host-update.json，使用者點通知即可下載、校驗與更新。
- 新版本採獨立程式與 Python 環境，保留主機設定，切換失敗嘗試恢復舊服務。
- 可重建來源與發布步驟放在 tools/host-installer。

## 驗證與下一步
- 編譯、版本比較、JSON 解析、SHA256、ZIP 路徑防護、套件入口、腳本語法檢查通過。
- 尚需在測試 Windows 主機完成首次安裝、通知、跨版本更新與恢復實測。
- 發布功能或模型新版需遞增 version.json 並重建 ZIP 與更新 manifest，一起推至 main。
- 舊安裝包需先安裝一次 2.0.0，之後才有更新通知。