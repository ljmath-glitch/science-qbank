---
name: qbank-visual-verify
description: 用 Playwright 對茲茲題庫系統的靜態 HTML（index.html / analytics.html / daily.html / progress.html / guide.html）本機截圖做視覺驗證。當使用者要「截圖／看一下長怎樣／看手機版／視覺確認／render／screenshot／幫我看看排版對不對」時使用。因為這些頁面會連 Supabase，截圖前必須 stub 掉 window.supabase，否則畫面空白或報錯。
---

# 題庫頁面視覺驗證

這些頁面是純靜態 HTML，但會 `supabase.createClient()` 連雲端抓資料。本機截圖要先把 supabase stub 掉、擋掉外部網路，才看得到畫面。

## 環境
- Playwright：`/opt/node22/lib/node_modules/playwright`
- Chromium：`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`（用 `executablePath` 指定；不要 `playwright install`）

## 用法
`node scripts/shot.cjs <html檔> <輸出png> [寬度] [fullPage:0/1] [mock資料json]`
- 例：`node scripts/shot.cjs /home/user/science-qbank/analytics.html out.png 390 1`（手機寬度、整頁）
- 例：`node scripts/shot.cjs /home/user/science-qbank/index.html out.png 1200 0`（桌機、僅首屏）
- 桌機寬度用 1200～1360，手機用 390。

## 重點（shot.cjs 已內建，改測試時要記得）
- **stub `window.supabase`**：`createClient` 回傳有 `from()`（鏈式 `select/neq/eq/order/limit/range` 都回 builder、`range` 回 `{data,error}`）與 `channel()`（`on/subscribe` 自鏈）的物件。
- **擋外部網路**：`page.route` 把非 `file://` 的請求 abort，避免真的 supabase-js CDN 載入後蓋掉 stub（這會讓 stub 失效、畫面空白）。
- **index.html 要解鎖**：`localStorage.setItem('ib_unlocked','1')` 跳過密碼鎖。
- **要看有資料的畫面**：傳一個 mock 資料 JSON 檔（陣列，每筆是一題的欄位），shot.cjs 會餵給 stub 的 `range()`。不傳則回空陣列（看空狀態／fallback）。
- **內嵌分析（iframe）驗證**：要驗 index.html 裡「題庫分析」分頁，載入後 `page.evaluate(()=>setActiveTab(4))` 切到該分頁，等 iframe 載入與 postMessage 自動長高後再截。

## 檢查完清掉暫存
截圖與測試 .cjs 放 scratchpad，不要 commit 進 repo。
