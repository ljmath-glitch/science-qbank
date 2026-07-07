# 茲茲文教自然科題庫系統 — 完整技術文件

這份文件的目標讀者：**完全沒看過這個專案的人（包含另一個 Claude）**。看完這份文件應該要能：獨立修 bug、加新功能、部署上線、以及排解 Ollama／Tailscale 連線問題。

---

## 1. 專案是什麼

一套給「茲茲文教」補習班內部使用的**國中自然科題庫管理系統**。核心用途：

- 老師把段考卷拍照/掃描，用 AI（Claude / Gemini）把考卷轉成結構化 CSV，匯入題庫
- 題庫依領域（生物/理化/地科）、單元、知識點、難度、題型分類，可篩選、搜尋
- 從題庫挑題組卷，匯出成 Word/HTML 考卷（可選有無詳解、答案卷/題目卷）
- 可用 AI（Claude / Gemini / ChatGPT / **Ollama 本機模型**）自動生成詳解
- 全部資料存在雲端（Supabase），多人可同時使用，不會互相覆蓋掉別人電腦上的資料

**正式網址**：https://science-qbank.vercel.app
**GitHub repo**：https://github.com/ljmath-glitch/science-qbank （只有一個 `main` branch）
**唯一原始碼**：整個系統是**單一一支 HTML 檔案** `index.html`（~3700 行，含 HTML/CSS/JS 全部寫在同一檔案裡，沒有建置流程，沒有 npm/webpack）

---

## 2. 部署方式（非常重要，決定你怎麼改東西）

1. `index.html` 改完直接 `git commit` + `git push` 到 GitHub `main` branch
2. Vercel 已經接好 GitHub webhook，**push 到 main 會在幾十秒內自動重新部署**，不用手動操作 Vercel 後台
3. 沒有任何 build step——Vercel 只是把整個 repo 當靜態檔案原樣發佈。改完 `index.html` 存檔、push，就是全部的部署流程
4. 驗證部署是否上線：`curl -s https://science-qbank.vercel.app | grep "你剛加的某個字串"`

**結論：不需要 `npm install`、不需要本機開發伺服器，改 HTML 檔案本身就是在改「原始碼」。**

---

## 3. 技術棧

| 項目 | 用什麼 |
|---|---|
| 前端 | 純 HTML + inline `<script>` + inline `<style>`，無框架（無 React/Vue） |
| 後端 | Supabase（Postgres + REST API + Storage），完全沒有自己的 server |
| 部署 | Vercel，靜態託管，push 到 GitHub main 自動上線 |
| 數學公式排版 | KaTeX（CDN 載入） |
| Excel/CSV 解析 | SheetJS (xlsx.js，CDN 載入) |
| 字型 | 華康中圓體 + GenSenRounded（Google 開源圓體，CDN） |
| AI 詳解生成 | Claude API / Gemini API / OpenAI API / **本機 Ollama**（四選一，使用者自己在網頁上選） |

Supabase 連線資訊寫死在 `index.html` 最上面（因為是 anon/publishable key，本來就設計給前端直接用，不是密鑰外洩）：

```js
const SUPABASE_URL      = 'https://esfepufqyeplafzbeeag.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P_OpGwKYuWxpHMHCZdQRPA_1lCCLfNf';
```

---

## 4. 資料庫結構（Supabase）

只有兩張表 + 一個 Storage bucket：

### 4.1 `questions` 表（主表，題目與題組文章都存在這裡）

程式內部用 JS 物件（欄位用 camelCase），存進 DB 前會做欄位名轉換（`toRow()`/`fromRow()`，程式碼約在 `index.html:949`）：

| DB 欄位（snake_case） | 程式內欄位 | 說明 |
|---|---|---|
| `id` | `id` | 唯一值，格式 `q<timestamp36><random4>` |
| `year` | `year` | 年度，例如 `114` |
| `school` | `school` | 來源學校 |
| `exam` | `exam` | 考試名稱（已正規化，如「114-八年級-下學期-第一次段考」或「114會考」） |
| `no` | `no` | 題號 |
| `ans` | `ans` | 答案 |
| `book` | `book` | 冊數代碼：`B1`~`B6`（B1/B2=七年級，B3/B4=八年級，B5/B6=九年級） |
| `book_name` | `bookName` | 冊名文字（如「南一/生物」） |
| `field` | `field` | 領域：`生物` / `理化` / `地科` |
| `unit` | `unit` | 大單元 |
| `sub` | `sub` | 子單元 |
| `kp` | `kp` | 知識點 |
| `summary` | `summary` | 題目摘要 |
| `type` | `type` | 題型代碼（見第 9 節 QTYPES），特殊值 `passage` 代表這筆是「題組閱讀文章」不是題目 |
| `step`/`mem`/`con` | 同名 | 步驟分／記憶分／概念分（各 0~不限，用來算難度） |
| `chart` | `chart` | 圖表類型 |
| `basis` | `basis` | 判斷依據／備註；如果內容以 `[回報]` 開頭，代表這題被標記為有問題，會出現在鈴鐺通知 |
| `flag` | `flag` | boolean，「待確認」標記（匯入時沒有答案，或人工標記回報問題時會是 true） |
| `q` | `q` | 題目內容（可含 LaTeX，`$...$` 包住） |
| `sol` | `sol` | AI 或人工寫的詳解 |
| `group_id` | `groupId` | 題組 ID，同一組的子題與題組文章共用同一個值 |
| `imgs` | `imgs` | **JSONB array**，格式：`[{src:"data:image/png;base64,..."或公開URL, width:數字}]` |
| `updated_at` | — | 每次 `toRow()` 都會自動蓋成 `new Date().toISOString()` |

> 舊圖片可能還是 base64 直接存在 `imgs` 裡；新上傳的圖片會先丟到 Supabase Storage 拿到公開 URL 再存（省資料庫空間），見 `uploadImgs()`，`index.html:1002`。

### 4.2 `syllabus_doc` 表（key-value 設定表，用 `id` 區分用途）

這張表本來是存課綱大綱文字，後來被挪用當「共用設定」的 key-value store：

| `id` | 用途 |
|---|---|
| `1` | 課綱大綱原始文字（`SYL_RAW`），沒有就 fallback 用內建的 `HANLIN_SYLLABUS` |
| `2` | 已存在的「考試名稱」清單（`examKeys`，匯入 CSV 時用來記錄自訂命名，避免重複） |
| `3` | `AI_CFG`，JSON 字串，存 Claude/Gemini/OpenAI 的 API Key、選用的模型、AI 供應商偏好。**這個是雲端共用的**，所以同事之間用同一顆 API Key 不用每個人各自輸入一次 |

### 4.3 Storage bucket

`question-images`：存題目圖片（png/jpg），路徑格式 `{題目id}/{時間戳記}_{index}_{隨機碼}.{副檔名}`。

---

## 5. 核心資料流

1. 開頁面 → `load()`（`index.html:967`）分頁抓 `questions` 表全部資料（每次 1000 筆一批直到抓完）→ 拆成 `DB`（一般題目陣列）和 `PASSAGES`（`{groupId: 題組文章物件}`）
2. 每筆題目做 `precompute()`：預先算好難度、學年、學期、考試類型、次別、年級（避免每次篩選都重算）
3. 畫面篩選用 `matches(it)`（`index.html:1610`）：文字搜尋 + 各種下拉篩選（冊數/領域/單元/子單元/知識點/題型/難度/年度/學期/學校/考試類型/次別/年級/圖表類型/待確認），同題組的題目會自動一起展開顯示
4. `render()` 分頁顯示（每頁 50 題）
5. 使用者勾選題目（`PICKS` Set）→ 可以「匯出考卷」或「選題CSV」

---

## 6. 功能模組

### 6.1 新增/編輯題目（`editDlg`）

手動輸入或編輯單題，支援：貼上圖片（Ctrl+V）、上傳圖片、拖拉調整圖片大小與位置、LaTeX 數學公式（`$...$`，KaTeX 即時預覽）、設定題組 ID 把多題綁成同一組（例如閱讀測驗）。

### 6.2 CSV / Excel 匯入（`doImport()`，`index.html:1047`）

> 給工讀生的完整操作 SOP（掃描 →「試卷寶」洗筆跡 → 餵給 AI（連原始檔一起附上）→ AI 產出 Excel → 匯入 → 逐題檢查排版/方程式/題組編號/承上題 → 補圖（含題組文章與題組圖）→ 到共編進度表打勾回報主管）寫在 `guide.html` 第三節「考卷處理與匯入完整流程（工讀生 SOP）」，這裡只記程式邏輯本身。

**目前正式欄位格式（23 欄，0-indexed）：**

```
0 年度, 1 來源學校, 2 考試名稱, 3 題號, 4 答案, 5 冊數, 6 冊名, 7 領域,
8 大單元, 9 子單元, 10 知識點, 11 題目摘要, 12 題型,
13 步驟分, 14 記憶分, 15 概念分, 16 圖表類型, 17 判斷依據,
18 待確認(填Y代表待確認), 19 題目, 20 詳解, 21 題組文章, 22 題組ID
```

**舊格式相容（22 欄）**：沒有獨立的「題組文章」欄，題組文章改用 `【題幹】` 分隔符寫在「題目」欄開頭，第 21 欄直接是「題組ID」。程式會自動判斷欄位數 (`r.length>=23` vs `>=22`) 決定用哪套解析邏輯。

匯入邏輯重點：
- 沒有答案（第4欄空白）會自動打上 `flag=true`（待確認）
- 匯入前會偵測「相同考試名稱」或「相同考試+題號」是否已存在，有重複會跳確認視窗
- 「題組文章」是獨立存進 `questions` 表的一筆記錄（`type='passage'`），跟子題共用 `groupId`
- 可用「📋 Claude 指令」按鈕複製一段預先寫好的 prompt，貼到任何 AI 對話視窗、附上考卷照片，AI 會回傳符合上述格式的 CSV，直接貼回匯入框即可（`copyPrompt()`，`index.html:2297`）

### 6.3 AI 生成詳解（`generateSol()`，`index.html` 約 2600 行）

四選一供應商，選單在「詳解」欄位旁邊：

| 供應商 | Key 存放 | 備註 |
|---|---|---|
| Claude | 使用者輸入 API Key，存 localStorage + 雲端 `AI_CFG` | 預設供應商 |
| Gemini | 同上 | 有模型選擇下拉選單，會動態抓 Google API 列出可用模型 |
| ChatGPT (OpenAI) | 同上 | 會自動處理模型棄用/改名的情況並重試 |
| **Ollama（本機）** | 不需要 API Key | 見第 7 節，是這次新加的功能，細節最多 |

固定的詳解撰寫規則（寫死在 `makeSolPrompt()`，`index.html:2551`）：
- 標題固定用【解題關鍵】【詳解】【觀念補充】（全形括號，禁止 Markdown `##`/`**`）
- 選擇題每個選項要標「(X) 正確：」或「(X) 錯誤：」
- LaTeX 一律只用單錢字號 `$...$`，絕對不能用 `$$...$$`
- 如果原本沒有答案，AI 會先自行判斷正確答案，用「【AI 判斷答案】X」標示，程式會自動抓出來回填答案欄

### 6.4 選題與配題

- 手動勾選單題（`togglePick`），同題組的子題會一起勾選/取消
- 「⚖ 依比例自動選」（`autoMix()`/`doAutoMix()`，`index.html:1728`）：在目前篩選條件下，依「簡單/中等/困難/極難」四個難度各設定要幾 % 比例、總題數，隨機抽題

### 6.5 匯出考卷（`openPaperDlg()` 開始，`index.html:1759`）

- 可自訂表頭（年級、科目、範圍、考試名稱），有 logo
- 答案顯示模式：無答案 / 答案卷 / 兩者都要（分開下載）
- 匯出成 Word（`.docx`，`downloadWordDoc()`）或 HTML
- 「選題CSV」：把目前勾選的題目匯出成 CSV（跟匯入格式類似，多一個算好的「難度」欄）

### 6.6 統計報表（`openReport()`，`index.html:1858`）

一鍵看題庫全貌：總題數、難度分布、題型分布、**哪些子單元完全沒有題目**（找出題庫缺口最實用的功能）。

### 6.7 待確認／回報鈴鐺（`toggleBellPanel()` 等，`index.html:1335` 起）

右上角鈴鐺圖示：抓出所有 `flag=true` 且 `basis` 開頭是 `[回報]` 的題目（代表有人標記這題有問題），有數字徽章。點開可以直接跳轉、編輯、或標記已解決（`bellResolve()`）。

### 6.8 備份/還原（`exportJSON()`/`restoreJSON()`，`index.html:1875`）

匯出整個 `DB` 成 JSON 檔本機備份；還原時逐筆 upsert 回雲端（不會刪除雲端既有資料，只會新增/覆蓋同 id 的資料）。

---

## 7. Ollama（本機 AI）功能 —— 最新加的功能，細節最完整

### 7.1 為什麼要有這個功能

Claude/Gemini/OpenAI 都要花 API 費用，而且題目內容（尤其會考題）不見得想上傳到外部 API。Ollama 可以在自己/公司的電腦上跑開源模型（如 `qwen2.5`），完全免費、資料不出網。

### 7.2 架構

```
瀏覽器（任何一台裝有 Tailscale 的 Mac/Windows 筆電）
   │  fetch() 直接打 Ollama 的 OpenAI 相容 API
   ▼
http://<Ollama主機的 Tailscale IP>:11434/v1/chat/completions
   │
   ▼
Ollama（跑在公司電腦 或 使用者自己的 Mac）
```

**沒有任何中介伺服器／proxy**——瀏覽器直接透過 Tailscale 私人網路打 Ollama 的 API。這代表：

1. 瀏覽器所在的裝置**必須**裝好 Tailscale 並登入跟 Ollama 主機同一個帳號
2. Ollama 主機（公司電腦或使用者的 Mac）**必須開機、Tailscale 保持連線、Ollama 程式保持執行**，這個功能才會動
3. 因為題庫網站是 `https://`，Ollama 只有 `http://`（沒憑證），瀏覽器會擋「混合內容」，見 7.5

### 7.3 目前已知的兩個 Ollama 主機

| 下拉選單顯示名稱 | 實際主機 | Tailscale IP | 系統 | 已裝的模型 |
|---|---|---|---|---|
| 大南路櫃2 | 公司電腦 | `100.72.250.96` | Windows | `qwen2.5:latest` (7.6B)、`llama3.2:1b` |
| 福大 Mac | 使用者的 MacBook | `100.127.211.80`（也可能用 `localhost` 或 mDNS `CHIAs-MacBook-Pro.local` 連到） | macOS | `qwen2.5:latest` |

這兩個名稱對應的網址寫死在程式碼的 `OLLAMA_PRESETS` 常數裡（`index.html` 約 2426 行）：

```js
const OLLAMA_PRESETS={company:'http://100.72.250.96:11434',mac:'http://localhost:11434,http://CHIAs-MacBook-Pro.local:11434,http://100.127.211.80:11434'};
```

「福大 Mac」這個選項本身就是逗號分隔的三個候選網址（本機 → 同 Wi-Fi → Tailscale），交給 `resolveOllamaBase()` 依序嘗試（見 7.7），不需要另外手動偵測。

> ⚠️ 如果之後 Tailscale 重新配過 IP，或換了新的主機電腦，這裡要手動更新，然後重新 push 部署。

### 7.4 每台 Ollama 主機需要的伺服器端設定（缺一不可）

| 設定 | Windows 做法 | macOS 做法 | 為什麼需要 |
|---|---|---|---|
| 對外監聽（不能只聽 `127.0.0.1`） | 環境變數 `OLLAMA_HOST=0.0.0.0`（系統內容→進階→環境變數，或 `setx OLLAMA_HOST 0.0.0.0`） | `launchctl setenv OLLAMA_HOST 0.0.0.0` | 預設 Ollama 只聽本機，其他裝置連不進來 |
| 允許跨網域請求 (CORS) | 環境變數 `OLLAMA_ORIGINS=https://science-qbank.vercel.app`（或設 `*`） | 同左 | 瀏覽器從 `https://science-qbank.vercel.app` 呼叫會被 Ollama 內建 CORS 擋掉（回 403），要明確放行這個網域 |
| 防火牆放行 11434 port | Windows Defender 防火牆 → 新增輸入規則 → TCP 11434 → 允許 | 通常不需要額外設定（或系統防火牆允許 Ollama.app） | 沒開的話 ping 得到但 port 連不上（`ERR_CONNECTION_REFUSED` 或逾時） |
| **設完一定要完全重啟 Ollama** | 工作列圖示右鍵 Quit，重開 | 選單列圖示 Quit，重開 | 環境變數只有新啟動的程序才會套用 |

驗證設定有沒有生效：
```
# Windows：新開一個 cmd（舊視窗環境變數不會更新）
netstat -ano | findstr 11434    → 要看到 0.0.0.0:11434，不是 127.0.0.1:11434

# macOS
lsof -iTCP:11434 -sTCP:LISTEN   → 要看到 *:11434 或 0.0.0.0，不是只有 localhost
```

### 7.5 瀏覽器端的限制：一定要用 Chrome/Edge，不能用 Safari

題庫網站是 HTTPS，Ollama 是 HTTP。瀏覽器預設會擋「HTTPS 頁面呼叫 HTTP 資源」（mixed content）。

- **Chrome / Edge**：網址列左側鎖頭圖示 → 網站設定 → 「不安全的內容」→ 允許，即可解除封鎖
- **Safari（包含 iOS 上所有瀏覽器，因為 iOS 規定底層都要用 Safari 引擎）**：**沒有任何設定可以繞過**，這條路直接走不通。所以目前 iPhone/iPad 完全沒辦法用這個功能，只能等以後幫 Ollama 掛 HTTPS（例如用 `tailscale serve`）才有機會解

### 7.6 前端 UI（`ollamaSettingsWrap`，`index.html` 約第 433 行）

AI 供應商選單切到「Ollama（本機）」後會出現：

- **下拉選單**：大南路櫃2 / 福大 Mac / 其他（自訂網址）——選前兩個會自動帶入對應網址，不用手動輸入（已移除獨立的🔍自動偵測按鈕，「福大 Mac」選項本身就內建多網址容錯，見 7.7）
- **模型輸入框**：預設 `qwen2.5:latest`
- **❓ 說明按鈕**：跳出 `ollamaHelpDlg` 對話框，給第一次使用的人看的完整說明（裝 Tailscale、選哪個選項、常見問題）

### 7.7 容錯機制（多網址依序嘗試）

網址欄位可以填**逗號分隔的多個網址**，「福大 Mac」預設就是三個候選網址：

```
http://localhost:11434,http://CHIAs-MacBook-Pro.local:11434,http://100.127.211.80:11434
```

選「其他」時也能自己填，例如公司優先、Mac 備援：
```
http://100.72.250.96:11434,http://100.127.211.80:11434
```

生成詳解時會呼叫 `resolveOllamaBase()`（`index.html` 約 2549 行）：對每個候選網址打 `/api/tags` 測連線（3 秒逾時），回傳第一個連得上的。

### 7.8 三個呼叫 Ollama 的地方

`generateSol()`、`solChatSend()`（詳解對話修正）、`batchGenerateSol()`（批次生成），三處都是：
```js
const olUrl=await resolveOllamaBase();
const olMdl=localStorage.getItem('ollamaModel')||'qwen2.5:latest';
result=await callOllama(sys,msg,olUrl,olMdl,imgs);
```
`callOllama()` 打的是 Ollama 的 **OpenAI 相容端點** `/v1/chat/completions`（不是 Ollama 原生的 `/api/generate`），這樣可以跟 `callOpenAI()` 共用差不多的訊息格式。

---

## 8. 難度與題型分類邏輯

**難度計算**（`calcDiff()`，`index.html:1029`）：`步驟分+記憶分+概念分` 加總，三項只要有一項是 0 就視為「未評分」：

| 總分 | 難度 |
|---|---|
| 1~4 | 簡單 |
| 5~6 | 中等 |
| 7~8 | 困難 |
| 9+ | 極難 |

**題型分類**（`QTYPES`，`index.html:665`）共 17 種代碼，分 6 大群組：

- A 觀念型：A1 概念辨識 / A2 概念推論 / A3 概念比較
- B 圖表型：B1 圖表判讀 / B2 圖表推論 / B3 圖表計算
- C 實驗型：C1 實驗操作 / C2 實驗設計 / C3 實驗結果推論
- D 計算型：D1 單步計算 / D2 多步計算 / D3 估算判斷
- E 素養情境型：E1 情境判斷 / E2 情境推論 / E3 長文閱讀
- 非選擇：填（填充）/ 計（計算）

**冊數與年級對應**：B1/B2 = 七年級，B3/B4 = 八年級，B5/B6 = 九年級。

---

## 9. 常見問題排解（踩過的坑）

| 症狀 | 原因 | 解法 |
|---|---|---|
| Ollama 連線 `ERR_CONNECTION_REFUSED` | Ollama 程式沒開，或只聽 `127.0.0.1` | 檢查 Ollama 有沒有在跑；檢查 `OLLAMA_HOST=0.0.0.0` 有沒有生效 |
| 在 Ollama 主機自己身上用它自己的 Tailscale IP 連不上 | Tailscale 通常不支援連回自己的 Tailscale IP | 自己測試要用 `localhost`，Tailscale IP 是給「別的裝置」連的 |
| 瀏覽器錯誤 `Failed to parse URL` | 網址欄位打錯，常見是中文輸入法把符號打成全形，或誤打成 `https://` | 用半形英文重打，確認是 `http://` |
| CORS 被擋，OPTIONS 回 403 | Ollama 沒設 `OLLAMA_ORIGINS` 允許這個網站的網域 | 設定 `OLLAMA_ORIGINS=https://science-qbank.vercel.app`（或 `*`），重啟 Ollama |
| Safari 顯示 `Load failed` | Safari 的 mixed content 政策無法繞過 | 改用 Chrome/Edge |
| Windows cmd 顯示「不是內部或外部命令」 | 公司電腦鎖了系統 PATH，`setx`/`netstat` 等指令不在 PATH 裡 | 改用 GUI 設定環境變數（`sysdm.cpl` → 進階 → 環境變數），或用完整路徑 `C:\Windows\System32\netstat.exe` |
| 用同一組 Tailscale 帳號登入多台裝置 | 這是刻意的共用帳號設計，方便同事免邀請直接加入 | 要注意：同一帳號登入的裝置預設彼此都看得到、連得到，如果需要限制，要去 Tailscale 後台（login.tailscale.com/admin/acls）設 ACL |

---

## 10. 本機開發 / 除錯建議

- 這是純靜態檔案，**直接用瀏覽器開 `index.html` 也能跑**（Supabase 是遠端雲端服務，跟本機開不開發伺服器無關）
- 改完 JS 想快速檢查語法有沒有寫錯，可以用 Node 抽出 `<script>` 內容跑 `node --check`：
  ```bash
  python3 -c "
  import re
  html = open('index.html').read()
  scripts = re.findall(r'<script(?:(?!src=)[^>])*>(.*?)</script>', html, re.S)
  open('/tmp/_check.js','w').write('\n;\n'.join(scripts))
  "
  node --check /tmp/_check.js
  ```
- 想確認 Vercel 是否已經部署新版本：`curl -s https://science-qbank.vercel.app | grep "某個剛加的獨特字串"`
- git remote 是 `https://github.com/ljmath-glitch/science-qbank.git`，只有 `main` branch，push 上去就是上線

---

## 11. 已知限制 / 之後可能要做的事

- iPhone/iPad 上完全無法使用 Ollama 功能（Safari mixed content 政策無解），如果之後真的需要，要研究幫 Ollama 掛 HTTPS（例如 `tailscale serve` 或反向代理 + 憑證）
- Ollama 的容錯（多網址 fallback）目前只能透過下拉選單的「其他」手動填逗號分隔網址，沒有 UI 讓使用者勾選「公司優先、Mac 備援」——如果很多人需要這個，可以再加一個第四選項自動組合兩個 preset
- `OLLAMA_PRESETS` 裡的 IP 是寫死的，換電腦或重新配 Tailscale 網段要記得回來改
- 目前只有一個 Supabase 專案，沒有 dev/staging 環境區隔，改資料庫欄位要直接在正式環境上小心操作
