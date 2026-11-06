# Codex 交接：組卷精靈「Gemini 匯出前題目健檢」

> 目標讀者：Codex（在使用者 Mac 本機跑）。這份文件把需求、位置、既有可重用程式、驗收標準全部講清楚，照做即可。全部改在 `index.html`（＋順手更新 `guide.html`、`changelog.json`）。改完 `git commit`＋`git push` 到 `main`（Vercel 會自動部署）。

---

## 1. 使用者要什麼（原話＋拆解）

使用者原話：
- 「在組卷精靈中，**匯出前**，用 Gemini API **檢查這次選的題**是否有題目圖片、選項、文字、答案出錯的部分」
- 「**還是可以直接出卷**，但是**該題文字全部用紅色標注**」
- 「檢查**文字 / 選項 / 答案的合理性**，**連圖片一起看**」
- 「**有問題的自動標記待確認**」

拆解成需求：

1. **觸發點**：組卷精靈 Step 3 準備匯出時（即 `wzToExport()`，`index.html:5393`）。在開啟考卷預覽／匯出前，先跑一輪 Gemini 健檢。
2. **檢查對象**：這次 `PICKS` 裡選到的題（用 `pickedItems()`，`index.html:4514`，回傳 `DB` 中被勾選的題）。題組子題也在其中；若要連題組文章一起看可一併送。
3. **送給 Gemini 的內容**：每題的「題目文字 `q` + 選項（已含在 `q` 內）+ 答案 `ans` + 詳解 `sol`（若有）+ 圖片 `imgs`（題目圖＋題組共用圖）」。
4. **Gemini 判斷**：該題的文字/選項/答案是否合理、圖片是否與題目相符、有沒有明顯錯誤（缺答案、答案不在選項中、選項重複、題幹與圖不符、亂碼等）。
5. **非阻擋**：健檢只是提示，**使用者仍可直接出卷**。不要因為有問題就擋住匯出。
6. **視覺標注**：被判定有問題的題，在**組卷精靈的題目清單中，整題文字用紅色顯示**（讓使用者一眼看到哪幾題要回頭檢查）。
7. **自動標記待確認**：有問題的題 **自動 `flag=true`**，並把 Gemini 給的理由寫進 `basis`（格式見 §4），`upsert` 回 Supabase。這樣該題會出現在主系統右上角🔔鈴鐺「回報」清單（鈴鐺抓的是 `flag=true` 且 `basis` 開頭 `[回報]` 的題）。

---

## 2. 可直接重用的既有程式（不要重造輪子）

| 用途 | 既有函式 | 位置 | 備註 |
|---|---|---|---|
| 呼叫 Gemini（含圖片、system+user、自動處理棄用模型） | `callGemini(sys, msg, key, imgs=[])` | `index.html:7485` | `imgs` 是 `[{src:...}]` 陣列；內部用 `_imgToBase64()` 轉 base64，data: 與公開 URL 都吃。回傳純文字字串。 |
| 取得 Gemini 金鑰（雲端共用 `AI_CFG` + localStorage + 提示輸入） | `getAIKey('gemini')` | `index.html:7418` 附近 | 沒 key 時會跳 prompt 要使用者輸入並存回 `AI_CFG`。 |
| 取得選到的題 | `pickedItems()` | `index.html:4514` | `DB.filter(x=>PICKS.has(x.id))` |
| 去除富文字標記（送 AI 前清乾淨） | `stripRichMarks(q)` | 已於 `generateSol` 使用 | 參考 `index.html:7574` 裡的用法 |
| 題組共用圖收集 | `PASSAGES[it.groupId]?.imgs` | — | 題目圖是 `it.imgs`，題組文章圖在 `PASSAGES[groupId].imgs` |
| 存回雲端 | `sb.from('questions').upsert(toRow(it))` | 參考 `index.html:3909` | 改完 `it.flag` / `it.basis` 後 upsert |
| 精靈題目清單渲染（要在這裡加紅字） | `wzRenderList()` | `index.html:5230` | 卡片文字來自 `_wzSimple(it)`（`index.html:5204`）/ `_wjFullHtml`；在卡片外層依「本題是否被標記問題」加 class |

**Gemini 呼叫範例**（照 `generateSol` 的寫法）：
```js
const key = getAIKey('gemini');
if(!key) return;                 // 沒 key 直接放行（非阻擋）
const imgs = [...(it.imgs||[]), ...((PASSAGES[it.groupId]&&PASSAGES[it.groupId].imgs)||[])];
const sys = '你是國中自然科資深審題老師…';   // 見 §3
const msg = '…本題資料…';                    // 見 §3
const raw = await callGemini(sys, msg, key, imgs);   // 回傳文字
```

---

## 3. 建議的 prompt 設計（可照需求調整）

**system**（固定）：
```
你是國中自然科（生物/理化/地科）資深審題老師。請檢查下面這一題是否有錯誤，從四個面向判斷：
1. 題目文字：是否通順、有無亂碼或缺字、語意是否完整。
2. 選項：選項是否完整、有無重複、是否與題幹對應。
3. 答案：是否有答案、答案是否落在選項範圍內、答案是否合理正確。
4. 圖片（若有附圖）：圖片是否與題目相符、是否缺圖或貼錯圖。
只回傳 JSON，格式：{"ok": true/false, "issues": ["簡短問題1","簡短問題2"]}。
沒有問題就回 {"ok": true, "issues": []}。問題描述要具體、精簡（每項 30 字內）。不要輸出 JSON 以外的任何文字。
```

**user**（逐題帶入）：
```
【題號】{no}
【領域/單元】{field} / {unit}＞{sub}
【題目】{stripRichMarks(q)}
【答案】{ans || '（無答案）'}
【詳解】{sol ? stripRichMarks(sol) : '（無）'}
（如有附圖請一併判讀圖片是否與題目相符）
```

**解析回傳**：`callGemini` 回的是字串，Gemini 可能包 ```json ... ``` 區塊。先用 regex 抓第一個 `{...}` 再 `JSON.parse`，解析失敗就當「無法判定」（不標記問題、不擋匯出，頂多 console.warn）。

---

## 4. 標記與存檔規則

有問題（`ok===false` 且 `issues` 非空）的題：

```js
it.flag = true;
const reason = '[回報] AI健檢：' + issues.join('；');
// 避免重複堆疊：若 basis 已有同樣的 AI健檢字串就覆蓋，否則前置
it.basis = reason + (it.basis && !/^\[回報\]/.test(it.basis) ? '　' + it.basis : '');
await sb.from('questions').upsert(toRow(it));
```

- `basis` 開頭用 `[回報]` 才會進🔔鈴鐺（見 CLAUDE.md §4.1 / §6.7）。
- 前綴用「AI健檢：」方便和人工回報區分。
- 記得同步更新記憶體內 `it`（已是同一物件參考），讓紅字即時生效。

**紅字顯示**：維護一個 `WZ_AICHECK_BAD = new Set()`（放有問題題目的 id）。`wzRenderList()` 渲染每張卡片時，若 `WZ_AICHECK_BAD.has(it.id)` 就在卡片文字容器加 class（例如 `.wz-aibad`），CSS：
```css
.wz-aibad .wz-qtext, .wz-aibad .wz-card-body { color:#d32020 !important; }
```
（實際 class 名稱對準 `wzRenderList` 現有 DOM 結構；目標是「整題文字變紅」。）

---

## 5. UI / 流程

1. 在組卷精靈工具列（Step 2/3 附近，靠近「組卷精靈 → 匯出」的按鈕）加一顆按鈕：**「🔍 AI 健檢（Gemini）」**，呼叫 `wzAiCheck()`。
2. 也在 `wzToExport()` 匯出流程做一個「**要先健檢嗎？**」的選項：可以是——點「匯出」時若尚未健檢過，跳一個非強制提示「要先用 Gemini 檢查這次選的題嗎？【檢查】【直接匯出】」。選「直接匯出」就照舊走 `openPaperDlg()`。**不要強制**。
3. `wzAiCheck()` 流程：
   - `const items = pickedItems();` 沒題就 `alert('尚未選題')`。
   - 逐題（建議序列、避免同時打爆 API；可顯示「檢查中 3/12…」進度）呼叫 Gemini。
   - 彙整：清空並重建 `WZ_AICHECK_BAD`；對有問題的題設定 `flag`/`basis` 並 `upsert`。
   - 跑完 `wzRenderList()` 重繪（紅字生效），並 `alert`/toast 總結：「檢查 12 題，發現 3 題可能有問題，已標記為待確認並以紅字標示，仍可直接匯出。」
   - 要有錯誤處理：單題失敗（網路/配額）不要中斷整批，記進 console，最後告知「X 題檢查失敗」。

---

## 6. 一定要一起做的收尾（使用者硬性要求）

> 使用者規定：**每個功能變動都要更新「使用說明」(`guide.html`) 與「更新內容」(`changelog.json`)**，否則不算完成。

1. **`guide.html`**：在組卷精靈相關章節加一段說明：AI 健檢功能怎麼用、檢查哪四個面向、有問題會紅字＋自動待確認、仍可直接出卷、需要 Gemini 金鑰（與詳解共用 `AI_CFG`）。
2. **`changelog.json`**：目前最新 build 約 `2026-10-28.3`，最大 id 到 56。新增一筆：
   - `id`: 57
   - `tag`: `新功能`
   - 標題類似「組卷精靈：匯出前 Gemini 題目健檢」
   - 內容：一句話講「用 Gemini 檢查選到的題目文字/選項/答案/圖片，有問題紅字標示並自動標待確認，仍可直接出卷」。
   - build 往上 bump（例如 `2026-10-28.4` 或 `2026-10-29.1`）。
   - （patchnotes.js 會依 build 自動跳新內容彈窗，不用改 patchnotes.js。）

---

## 7. 驗收標準

- [ ] 組卷精靈選幾題 → 點「AI 健檢」→ 有進度、跑得完。
- [ ] 故意放一題沒答案或答案不在選項內 → 被判有問題 → 清單中該題文字變紅。
- [ ] 有問題的題 `flag=true`、`basis` 以 `[回報] AI健檢：` 開頭，重新整理主系統後出現在🔔鈴鐺。
- [ ] 健檢後仍可照常「匯出考卷」（非阻擋）。
- [ ] 沒設 Gemini 金鑰時：提示輸入或溫和略過，不報錯崩潰。
- [ ] 有附圖的題，Gemini 確實收到圖片（`callGemini` 的 `imgs` 有帶）。
- [ ] `guide.html`、`changelog.json` 已更新；`node --check` 抽出的 script 無語法錯（見 CLAUDE.md §10）。
- [ ] `git push` 到 `main`，`curl -s https://science-qbank.vercel.app | grep "AI 健檢"` 能查到。

---

## 8. 注意事項 / 踩過的坑

- **非阻擋**是硬需求——任何失敗都不能擋住出卷。
- Gemini 回傳可能夾 markdown code fence，解析要寬容。
- 圖片可能是 base64（舊）或 Supabase 公開 URL（新），`_imgToBase64` 兩者都處理，直接把 `it.imgs` 丟給 `callGemini` 即可。
- 題組：子題與題組文章共用 `groupId`；圖片分散在 `it.imgs`（子題）與 `PASSAGES[groupId].imgs`（題組文章）。
- 標記 `basis` 時小心不要把舊的 `[回報]` 內容洗掉；多次健檢要能覆蓋自己上次的 AI健檢字串，不要無限堆疊。
- 逐題序列呼叫即可（題數通常 20~50），避免並發打爆 Gemini 免費配額。
