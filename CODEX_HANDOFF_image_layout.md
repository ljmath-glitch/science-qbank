# Codex 交接：匯出考卷「圖片排版統一」（置中＋自成一行、全部題號、全部靠左）

> 讀者：Codex（本機 Mac，能在**真正的 Word** 驗證）。這份交接是使用者親自確認過的需求與根因。全部改在 `index.html`（＋順手更新 `guide.html`、`changelog.json`）。改完 commit＋push 到 `main`。

---

## 0. 背景與重要前提

- 使用者把一份「課前考/ABK 範本」匯出的 Word（`downloadWordViaTemplate`，docxtemplater 填範本）拿去檢查，回報 4 個不一致。
- ⚠️ **使用者提供的樣本檔是「跑過 MathType Toggle TeX 之後」的**（含 `oleObject*.bin`）。所以其中「題號/置中」的現象，**有可能部分是 Word/MathType 重存時造成的**。**動工前請先用系統重新匯出一份「沒跑 MathType 的原始 Word」來重現、確認是我們輸出就這樣，再動手**（尤其是下面問題①③）。
- ⚠️ **方向反轉確認**：先前 `CODEX_HANDOFF_word_export.md` 做的是「文繞圖靠右（float right）」。**使用者現在明確改要「圖片置中、自成一行」**，等於把文繞圖那套拿掉。這是使用者當面確認的新方向。
- 這塊**一定要用真正的 Word 驗證**（LibreOffice 對浮動錨定／原生編號的呈現跟 Word 不同，會看走眼）。

---

## 1. 使用者的需求（原話 → 目標）

原話（4 點，都是「不是全部都…」＝要統一）：
1. 不是所有題目都有題號
2. 不是所有圖片都置中
3. 不是所有題幹文字選項都靠左
4. 不是所有圖都自成一行

**目標版面（統一、簡單）：**
- ✅ **每一題都有題號**（Word 原生自動編號，連續不中斷）
- ✅ **題幹＋選項一律靠左**（`jc=left`，不要 center）
- ✅ **每一張圖都「置中、自成一行」**：獨立段落、水平置中；**不要**「排在選項旁」、**也不要**「靠右浮動文繞圖」

---

## 2. 已查證的根因（含函式與行號，行號以當時版本為準，請以函式名為準）

### 問題②④（圖片不置中、沒自成一行）— 這是我們的程式行為，確定

- `_defaultImagePlacement(images,raw,kind,heights)`（約 `index.html:8536`）會把圖片「聰明」分流：
  - 單張小圖（寬 ≤42%、且放得下選項旁）→ 回傳 **`'beside'`**（排在選項旁，**沒有自成一行**）。
  - 其餘（大圖/多圖/放不下）→ 回傳 **`'block'`**。
- `'block'` 圖在 `_preFloatQuestionImages(xml,positionH,layouts)`（約 `index.html:8674`）裡被處理成**靠右浮動**（`<wp:align>right</wp:align>` 的 `wp:anchor`），**不是置中**。
- 這兩條路（beside / 靠右浮動）就是「不置中、不一致」的來源。

**此函式同時被兩處使用，改了要兩邊一致：**
- Word 匯出：`downloadWordViaTemplate`（約 `index.html:9711`）→ 第 ~9762 行 `_defaultImagePlacement(...)` 決定 placement，之後 `_preFloatQuestionImages` 處理。
- 預覽/HTML：`buildPaperInner`（約 `index.html:5970`）→ 第 ~6003 行也呼叫 `_defaultImagePlacement`，`beside`/`block` 走 `imgHtmlPreview(...)`。**預覽要跟 Word 一致**，否則使用者在預覽看到的跟匯出不同。

### 問題①③（有些題沒題號、被置中）— 需先用乾淨檔重現確認

- 在使用者的（post-MathType）樣本裡，有 3 題**一般單題**（非題組，`group_id` 空）在 `word/document.xml` 裡是 **`<w:jc w:val="center"/>` 且沒有清單編號（無 `<w:numPr>`）**，所以沒題號又置中：
  - 玻璃罩實驗（type C3）、海豚頻率表（B2）、三音叉波形（B3）——**共通點：都是含圖的題**。
  - 對照：劉賓客（E1，**無圖**）就正常有題號、靠左。
- Word 原生題號是用清單 `numId=100`（ABK/課前考題目段落）自動產生的；這 3 題掉出了清單＋被置中。
- **請 Codex 先重現**：用系統重新匯出（**不要**跑 MathType），看這 3 題是否仍然無題號＋置中。
  - 若**仍然**→ 是我們範本/程式的問題，需找出為何含圖題的段落會變 `jc=center`／失去 `numId=100`（可能在範本 `templates/abk_tpl.docx`／`pre_tpl.docx` 的 placeholder 段落樣式，或 `_tplQuestionText`／`_preOptionLayout`／`_preFloatQuestionImages` 某處改了段落屬性），修成**一律 `numId=100` 清單 + `jc=left`**。
  - 若重現不出來（乾淨檔是正常的）→ 代表是 Word/MathType 重存造成，**不是我們的 bug**，回報使用者即可，不要亂改。

---

## 3. 建議的實作方向

> 核心：把「圖片」從『排版的一部分（beside/float）』改成『獨立置中段落』。這樣在 Word 與 LibreOffice 都穩定、可驗證。

1. **`_defaultImagePlacement` 一律回傳 `'block'`**（移除 beside 判斷）。保留函式簽章，內部直接 `return 'block';`（或加一個開關常數，預設統一 block）。
   - 這樣沒有圖會排在選項旁 → 解決 ④。
2. **`'block'` 圖改成「置中、自成一行」而非靠右浮動**：
   - Word（`_preFloatQuestionImages` / template 後處理）：block 圖**不要**轉成 `align=right` 的 anchor；改成**獨立段落、inline 圖、段落 `jc=center`**，置於該題所有選項之後。
   - 預覽（`buildPaperInner` + `imgHtmlPreview` / `imgHtml`）：block 圖輸出成置中的區塊（`display:block;margin:… auto;text-align:center`），拿掉 `float:right` / `pvimg-beside` 那套。
   - 解決 ②④，且預覽＝匯出。
3. **題幹＋選項一律 `jc=left`**：確認題目段落樣式不被設成 center（解決 ③）。
4. **每題都有題號**：確認每個題目段落都掛上 `numId=100` 清單編號、連續不中斷（解決 ①）。先依 §2 重現確認根因再修。
5. **範圍**：以 ABK/課前考範本（`downloadWordViaTemplate`，`kind='abk'|'pre'|'golden'`）為主；若 mock/一般 Word（`generateAndDownloadWord`/`generateMockWord`）也有同樣的 beside/float 行為，一併統一成置中自成一行。

> 注意別動到**題組共用圖**：題組文章在 Word 文字方塊（txbxContent）內，共用圖必須維持 inline 在方塊內（`_preFloatQuestionImages` 已用 `groupRanges` 排除，別破壞）。題組共用圖一樣要「置中自成一行」，但要在文字方塊內置中，不是轉 anchor。

---

## 4. 驗收標準（務必在真正的 Word 開啟驗證）

- [ ] 重新匯出一份考卷（含多張大小不一的圖、含題組），在**真 Word** 打開：
  - [ ] 每一題都有連續題號（① 不再有漏號）
  - [ ] 所有題幹與選項都靠左（③ 不再有置中題）
  - [ ] 每張圖都置中、自成一行（②④ 沒有圖排選項旁、沒有靠右浮動）
  - [ ] 題組共用圖仍在題組文字方塊內，且置中自成一行
- [ ] 預覽（組卷精靈/匯出設定預覽）與 Word 匯出**長得一致**。
- [ ] `node --check` 抽出的 script 無語法錯（見 CLAUDE.md §10）。
- [ ] `guide.html`、`changelog.json`（build 往上 bump、新增一筆「匯出圖片統一置中自成一行、全部題號靠左」）同步更新。
- [ ] push `main`，`curl` 確認上線。

---

## 5. 可重現用的樣本

使用者提供的樣本（都在對話上傳）：`Ch.3-2…docx`、`twyredtufyguhiop…docx`（兩份都 post-MathType，版面相同）。**動工請改用系統現匯出的乾淨檔**比對。
