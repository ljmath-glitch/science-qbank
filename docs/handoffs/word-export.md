# 交接：課前考（pre）Word 匯出 — 教用版版面修正

給本地 Codex 的任務說明。Claude（遠端）作為小主管會審查你的成果。
**repo**: `ljmath-glitch/science-qbank`　**分支**: `claude/remote-control-macbook-g87ate`（已與 `main` 同步）
主檔：`index.html`（純靜態，無 build；push 到 `main` 由 Vercel 自動部署到 https://science-qbank.vercel.app ）。

> 先 `git pull origin claude/remote-control-macbook-g87ate`（或 `main`，兩者目前同一個 commit）。

---

## 背景：匯出流程

課前考/ABK/黃金模擬用 **docxtemplater** 範本產生 Word：
- 進入點：`downloadWordFromDlg()` → `downloadWordViaTemplate(kind,opts)`（`index.html` 內，搜尋函式名）。
- 範本：`templates/pre_tpl.docx`（課前考）、`abk_tpl.docx`、`golden_tpl.docx`。
- 題目文字來源：`_tplQuestionText(it)`，回傳純文字，選項以 `\n(A)…\n(B)…` 分行。
- **學用版**＝空括弧 `(　　)`；**教用版**（`opts.teacher`）＝紅字答案。答案做法：在 qText 前加哨兵 `答案`，render 後由 `_tplAnswerBoxes(xml)` 把哨兵換成「浮動文字方塊 run」(`_answerBoxXml`)，疊在題號括弧上。`ANSBOX` 常數控制偏移（`offX/offY/w/h/perDigit`，單位 EMU）。
- 選項打包：`_preOptionLayout(text)`（課前考才呼叫），依「去掉 (A)(B) 後的字數」把選項排 1/2/4 個一行，同一行的選項之間插入哨兵 `PRE_OPT_TAB`（``），render 後換成 `<w:tab/>`。

## 使用者這次的 4 個不滿（教用版課前考）

1. **簡答沒有對齊** — 紅字答案浮動框沒有對準題號括弧 `(　　)` 的中間。需要微調 `ANSBOX`。
2. **圖片/表格沒有靠右，而且還是 In Line with Text** — 要改成 Word 的 **文繞圖（靠右）**：圖靠右、文字排在圖左邊（使用者在選單指的是圖要變成浮動物件、不要 inline）。
   - 注意：預覽端（`index.html` 的 `buildPaperInner`/`imgHtmlPreview`）已經做成 `float:right` 文繞圖，Word 要對齊這個行為。
3. **短選項沒有自動同一行** — 「有圖→一律一行一個」規則。**（已修）** Claude 已移除該規則，現在有圖也照字數打包。你不用再動這點，但請確認你的改動不要破壞它。
4. **同一行的選項間距沒出來 / 要用「定位點」對齊** — 這是目前最卡的點，詳見下方「關鍵發現」。

---

## 關鍵發現（省你時間，請務必先讀）

我（Claude）嘗試用「定位點(tab stops)」讓同一行選項對齊，卡在**找不到選項段落真正的定位點來源**。已確認：

- `pre_tpl.docx` 的 `word/document.xml` 裡，`{text}` 佔位看起來在一個 `numId=108`、`<w:tabs><w:tab w:pos="0"/></w:tabs>` 的段落。
- **但 render 後**：`numId 108` 消失（0 筆）、`pos=0` 還在 2 筆；而「選項段落」實際套用的定位點是 **`709/1843/2977/4111`**（很窄，所以同一行選項擠在一起）。
- 範本裡 `709/1843/2977/4111` 這組字串**只出現 1 次**，而且 render 後對它加 `<w:keepLines/>` 只會命中 **1 個段落（一個帶 `<w:sectPr>` 的結尾段落）**，**不是**每一題的選項段落。
- 也就是說：**每題選項段落的 `<w:tabs>` 從哪裡繼承、該怎麼逐題改，尚未查清**。這需要在本地用真正的 Word/解壓 docx 仔細對照（你有本地環境，迭代比我快）。

### 建議作法（擇一，請你決定並實作）
- **方案 A（定位點，使用者偏好）**：查清 render 後「每一題選項段落」的實際 `<w:p>`/`<w:pPr>`/`<w:tabs>` 結構，然後**逐題**（依該題欄數）設定定位點：
  - 版心寬 = 頁寬 14570 − 左右邊界 720×2 = **13130 twips**。
  - 2 欄 → 定位點 50%：`pos="6565"`，選項間 1 個 `<w:tab/>`。
  - 4 欄 → 25/50/75%：`pos="3283"/"6565"/"9848"`，選項間 1 個 `<w:tab/>`。
  - 難點：2 欄和 4 欄若共用同一段落樣式，單一 tab 無法同時對齊 → 需**逐題**設定該段落 `<w:tabs>`（可在 `_preOptionLayout` 回傳值最前面放一個「欄數記號」哨兵，render 後用 regex 找到含該哨兵的 `<w:p>…</w:p>`，替換它的 `<w:tabs>`，再移除哨兵）。
  - ⚠️ 教用版的答案浮動框內含**巢狀 `<w:p>`**，會干擾「抓整個選項段落」的 regex。對策：**在插入答案框（`_tplAnswerBoxes`）之前**就先設定好定位點。
- **方案 B（更穩）**：選項改用**無框線表格**（每欄一格）取代 tab，天生對齊、不怕溢出。但要改範本或在 render 後把選項段落轉成表格，工程較大。

> 我這次嘗試過方案 A 但哨兵/段落比對沒成功（定位點沒套上、keepLines 只中 1 個），**已全部 revert**，目前 `index.html` 是乾淨的 HEAD＋只保留「移除有圖→一行」那一點。你不會看到我失敗的程式碼。

---

## 點 2（圖片文繞圖/靠右）在 Word 的作法

docxtemplater-image-module-free 預設插入 `<wp:inline>`（就是 In Line with Text）。要改成文繞圖：
- render 後把題內圖的 `<w:drawing><wp:inline …>…</wp:inline>` 轉成 `<wp:anchor …>`：
  - `behindDoc="0"`、`<wp:simplePos …/>`、`<wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>`、`<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>`、`<wp:wrapSquare wrapText="left"/>`、保留原本的 `<wp:extent>`/`<wp:docPr>`/`<a:graphic>`。
  - 只處理**題內圖**（單題），題組共用圖維持原樣（或另議）。
- 影像尺寸來源：`imageSizes` map + `_tplFitImage`（已存在）。
- 題組文字方塊的 docPr id 去重邏輯（`9000001`）已存在，別破壞。

## 點 1（答案框對齊）

- 調 `ANSBOX = {offX, offY, w, h, perDigit}`（EMU，1 inch=914400）。目標：紅字答案置中疊在題號 `(　　)` 的兩個全形空格中間，字級 10pt、Times New Roman、無底色無框線（這些 `_answerBoxXml` 已設好）。
- 需要你在**真 Word** 開教用版、量實際偏差再微調（我這端無法開 Word 驗證浮動物件位置）。

---

## 驗證方式（本地）

- 我寫了一個 Node 驗證腳本雛形（在 Claude 的 scratchpad，不在 repo），用 `pizzip`+`docxtemplater` 直接 render `pre_tpl.docx` 並檢查 XML（tab 停駐點數、keepLines 數、紅字 run 數、是否 well-formed）。你可自行用 `npm i pizzip docxtemplater` 寫類似腳本，或直接用真 Word 開檔檢查。
- 語法檢查：抽出 `<script>` 跑 `node --check`（見 `CLAUDE.md` §10）。
- 部署驗證：`curl -s https://science-qbank.vercel.app | grep "你加的字串"`。

## 規矩（CLAUDE.md 要求）

- **每個功能改動都要同步更新 `guide.html`（使用說明）與 `changelog.json`（更新內容公告，加一筆 entry、更新 build）**，否則使用者無法驗收。
- commit 訊息結尾加：
  `Co-Authored-By: ...`（沿用你自己的）；本專案只有 `main`，push 後自動部署。
- 改完請把「做了什麼、怎麼驗證、還有什麼沒解」回報，Claude 會審查。

---

## TL;DR 待辦
- [ ] 點 4：查清每題選項段落定位點來源 → 逐題設 2欄50% / 4欄25-50-75%，同行選項對齊有間距（方案 A 或改表格方案 B）。
- [ ] 點 2：題內圖改 `<wp:anchor>` 文繞圖、靠右（對齊預覽的 float:right）。
- [ ] 點 1：微調 `ANSBOX` 讓紅字答案對準括弧（需真 Word 量測）。
- [ ] 點 3：已修（有圖也打包短選項）— 只需確認沒被你的改動破壞。
- [ ] 同步 `guide.html` + `changelog.json`。
