---
name: qbank-ui-style
description: 茲茲文教系統的前端頁面美化與外觀一致性。當使用者要「美化頁面、統一外觀、讓某頁跟課務系統／人資系統風格一致、套用品牌設計、調整配色/字型/元件、彈跳窗/按鈕/卡片風格統一、UI 太醜/有大色塊要修」時使用。適用於本專案所有 HTML（index.html / analytics.html / daily.html / progress.html / guide.html）及任何新頁面。
---

# 茲茲文教 UI 風格指南

讓所有頁面跟**課務系統／人資系統**同一套視覺語言：**淺色、留白、乾淨、深紅點綴**。同目錄的 `design-tokens.css` 是可直接複製或引入的設計 token＋基礎元件。

## 套用方式
1. 新頁面或改版時，把 `design-tokens.css` 的 `:root` 變數與基礎元件整段放進頁面 `<style>`（本專案頁面都是單檔 inline CSS），或以 `<link rel="stylesheet" href="design-tokens.css">` 引入。
2. 一律用這些 CSS 變數，**不要寫死色碼**。文字用 `var(--ink)`、次要 `var(--muted)`、主色 `var(--red)`。
3. 元件直接用 `.btn` / `.btn.primary` / `.card` / `.tag` / `.section` / `dialog` + `.dlg-head` / `.chk`。
4. 改完用 `qbank-visual-verify` skill 截圖（桌機 1200、手機 390）確認一致。

## 設計原則（務必遵守）
- **底色米白**（`--paper #f6f5f2`），**卡片白**，**細線 `--line`**，**陰影極淺**（`--shadow`）。頁底不要用純白，主色不要用純黑（用 `--ink`）。
- **深紅 `--red #850103` 是點綴不是背景**：用在主按鈕、選中態、重點數字、hover。**每個畫面最多一個 `.btn.primary` 主按鈕**，其餘用預設淺色 `.btn`。
- **hover 互動轉紅**：淺色按鈕 hover 變紅字＋微浮起（token 已內建），保持這個手感。
- **字型**：UI 一律 `var(--ui-font)`（系統字型）。**華康中圓體 `HuaKangTNR` 只准用在考卷預覽/列印/匯出**，正常 UI 絕不使用。
- **對話框**：桌機置中圓角、手機自動變底部 sheet（token 已內建 `@media`）。標題用 `.dlg-head`。
- **領域色**：生物 `--bio` 綠、理化 `--phy` 琥珀、地科 `--earth` 藍，用在卡片左側色條或圖表分類，不要拿來當大面積背景。
- **響應式**：手機卡片/區塊 padding 收小、圓角略大、對話框轉 sheet；長表格/寬圖用 `overflow-x:auto` 包起來，頁面本身不要橫向捲動。

## 常見要修掉的「不一致」
- ❌ 大面積飽和色塊當背景（深紅/亮色填滿一整塊）→ 改成白卡＋細線＋色只用在點綴。
- ❌ 深色填色面板當一般 UI（深色只保留給特殊 hero，如每日一題角色卡）。
- ❌ 系統預設藍色連結／藍色 focus → 用 `--red` / `--muted`。
- ❌ 到處寫死 `#xxxxxx` → 換成對應 CSS 變數。
- ❌ UI 用到 HuaKangTNR 圓體 → 換回 `var(--ui-font)`。
- ❌ emoji 當主要視覺 → 克制使用，優先用線條 icon 或文字。

## 驗收
改完該頁在桌機與手機都：底色米白、白卡細線、按鈕淺色 hover 轉紅、只有一個主紅按鈕、字型是系統字、對話框在手機是底部 sheet、沒有突兀的大色塊。用 `qbank-visual-verify` 截圖比對。
