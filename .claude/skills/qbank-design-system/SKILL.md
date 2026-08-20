---
name: qbank-design-system
description: 茲茲文教自然科題庫系統的視覺設計系統與美化規範（色彩、字型、元件樣式、手機版）。當使用者要「美化／改樣式／調版面／改配色／改字型／做手機版／新增按鈕或卡片或對話框」、要新頁面與現有風格一致、或改 index.html/analytics.html/daily.html/progress.html/guide.html 的 CSS 時使用。關鍵字：美化、樣式、CSS、配色、品牌色、茲茲、深紅、字型、華康中圓體、卡片、工具列、對話框、按鈕、RWD、手機版、響應式、設計系統。
---

# 茲茲題庫視覺設計系統 SOP

改任何樣式或做新頁面前先讀這份，讓成品跟既有畫面一致。**核心原則：用既有 CSS 變數與元件樣式，不要引入新的一次性色碼／字型／圓角；改一個地方前先在 `index.html` 搜同類元件抄它的寫法。無框架、純 inline `<style>`，所有規範都寫死在 `index.html:21-442` 的 `<style>` 區塊與 `:root`（`index.html:25`）。**

## 設計 token（一律用變數，別寫死色碼）
定義在 `:root`（`index.html:25-34`）：
| 變數 | 值 | 用途 |
|---|---|---|
| `--ink` | `#2d3038` | 主文字色 |
| `--paper` | `#f6f5f2` | 頁面底色（米白，非純白） |
| `--card` | `#ffffff` | 卡片/面板底 |
| `--line` | `#e6e4de` | 邊框/分隔線 |
| `--red` `--accent` | `#850103` | **茲茲品牌主色（深紅）**，hover、active tab、重點 |
| `--orange` | `#f9a12c` | 橘色點綴 |
| `--gold` | `#af9a6b` | 金色點綴 |
| `--muted` | `#6e6f74` | 次要文字、未選中 tab |
| `--bio` `--phy` `--earth` | `#1f6f5c`/`#b8860b`/`#3454b4` | 領域色：生物綠／理化金／地科藍 |
| `--shadow` | `0 2px 0 #eceae4, 0 8px 24px -12px rgba(45,48,56,.16)` | 卡片標準陰影 |
- 品牌調性：**米白底 + 深紅主色 + 橘/金點綴**，跟人資／課務系統同一套。用色克制，紅色只給重點與互動狀態，別大面積鋪。
- 領域一致性：生物→綠、理化→金、地科→藍，任何依領域上色的地方都照這組。

## 字型策略（別亂加字型）
- **介面**：`--ui-font` = `"PingFang TC","Microsoft JhengHei",system-ui,...`。一般 UI 一律 `font-family:var(--ui-font)` 或 `inherit`。
- **考卷預覽／匯出**：華康中圓體 `'HuaKangTNR'`——用 `@font-face` + `unicode-range` 讓中文走華康圓體、英數走 Times New Roman（`index.html:23-24`）。**這個字型只用在考卷/題目排版，不要拿來當 UI 字型。**
- `body` 預設 `font-weight:500`（偏中黑），標題 `font-weight:700~800`。

## 元件樣式（新增元件先抄這些 class）
- **卡片/面板**：`background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)`（見 `.toolbar-outer` `index.html:53`）。圓角統一 `10px`（大面板）／`6~9px`（小元件）。
- **分頁 tab**（工具列 `.tb-tab`、篩選 `.ft-tab`）：未選 `background:#f1e9db;color:var(--muted)`；hover `#ece2d0`；`.active` `background:var(--card);color:var(--red)` 且底線用 `box-shadow:...inset var(--red)`。要做新分頁抄 `index.html:72-75`。
- **hover 互動**：可點元素 hover 一律 `color:var(--red)` 或 `border-color:var(--red)`，`transition:.15s`。
- **浮動面板模式**（工具列/篩選/鈴鐺）：正常在頁面流內；捲動後 `position:fixed` 貼齊 + 半透明 overlay（`#toolbarOverlay` `rgba(45,48,56,.35)`），點外面關閉。要做新的浮動面板照這個模式（`index.html:53-56`）。
- **答案紅**：題目答案/警示用 `#c0392b`（`--red` 系但略亮），如 `index.html:3280`。

## 手機版 / RWD（必做，不是選配）
- 主斷點 **`@media(max-width:860px)`**（次要 `max-width:600px`）。改版面一定要一起顧手機。
- 手機常見手法：桌機表格→改卡片（見 progress.html 的做法、commit `02aa799`）；浮動面板改成貼底 `bottom:0`、`border-radius:14px 14px 0 0`、`max-height:88dvh`（`index.html:59`）；工具列標籤精簡。
- 版面容器 `.wrap{max-width:1240px;margin:0 auto;padding:0 24px}`；`html/body` 都 `overflow-x:clip` 防橫向捲動——新增寬元件要自己 `overflow-x:auto`，別撐破 body。

## 五個頁面共用這套系統
`index.html`（主）、`analytics.html`（分析）、`daily.html`（每日一題）、`progress.html`（進度表）、`guide.html`（說明）視覺要一致。改其中一頁的共用元件時，確認別的頁面有沒有同款要一起改。

## 做完一定要視覺驗證
- 用 **`qbank-visual-verify`** skill（Playwright 本機截圖，會先 stub 掉 `window.supabase` 避免空白）截桌機 + 手機版對照，確認配色/字型/圓角/陰影跟既有一致、手機不爆版。
- 改完 `node --check` 驗語法（見 `CLAUDE.md` 第 10 節），`git push` main → Vercel 自動部署（可用 `deploy` skill）。

## 別做的事
- 不要引入 CSS 框架、不要加 build step（整站是單一 HTML、Vercel 原樣發佈）。
- 不要新增一次性色碼／圓角／陰影；不夠用時先加進 `:root` 變數再引用。
- 華康中圓體不要當 UI 字型；品牌深紅不要大面積鋪。
