---
name: qbank-sol-generate
description: 茲茲文教自然科題庫系統的 AI 詳解生成規則與四家供應商（Claude／Gemini／ChatGPT／Ollama 本機）串接。當使用者要改詳解生成邏輯、調整詳解格式規則、修 makeSolPrompt／generateSol／solChatSend／batchGenerateSol、處理 LaTeX 排版錯誤、AI 判斷答案回填、或 Ollama 連線與 fallback 問題時使用。關鍵字：詳解、AI 生成、makeSolPrompt、解題關鍵、觀念補充、LaTeX、單錢字號、Ollama、resolveOllamaBase、批次生成、詳解對話修正、AI 判斷答案。
---

# AI 詳解生成規則與供應商串接

處理 `index.html` 的詳解生成：`makeSolPrompt()`（`index.html:4813`，規則來源）、`generateSol()`（`index.html:4821`，單題生成）、`solChatSend()`（`index.html:4911`，對話式修正）、批次生成。**核心原則：詳解格式規則是寫死在 prompt 裡的硬約束，改規則就是改 `makeSolPrompt`／各 sys prompt，不要在別處補丁。四家供應商共用同一份 sys/msg。**

## 固定詳解格式（改格式改這裡）
規則寫死在 `makeSolPrompt()` 的 `rules`／`example`（`index.html:4815-4817`）：
1. **三段標題固定**：`【解題關鍵】`、`【詳解】`、`【觀念補充】`，全形括號。**禁止 Markdown**（`##`、`**`、`*`）——`generateSol` 事後也會用 regex 再剝一次 Markdown（`index.html:4855`），但根源是 prompt 要求。
2. `【解題關鍵】`：一句話點核心觀念。
3. `【詳解】`：選擇題每個選項固定 `(X) 正確：解析` 或 `(X) 錯誤：解析`；計算題只留關鍵代入步驟。
4. `【觀念補充】`：有教學價值才寫 1～2 句，否則整段省略。
5. 不重複題號/範圍、不寫「故選(A)」。

## LaTeX 規則（最常出包，務必嚴守）
- **只用單錢字號 `$...$`**。絕對禁止 `$$...$$`、`\[...\]`、`\(...\)`（KaTeX 會壞）。
- 內文任何測量值/數量/裸數字也要包，如「共有 $12$ 顆分子」。
- 唯一例外：溫度 `℃` 直接照打（如 `25℃`），不要轉成 `$^\circ\text{C}$`。
- 化學反應式箭頭條件用 `\xrightarrow[下方]{\text{上方}}`；**禁止** `\overset`/`\underset` 配 `\longrightarrow`（KaTeX 渲染不出）。

## 無答案時的「AI 判斷答案」回填
- 若題目沒答案，`rules` 第 7 點要求 AI 在最前面單獨一行寫 `【AI 判斷答案】X`。
- `generateSol` 用 regex `/【AI\s*判斷答案】\s*([A-Da-d])/` 抽出該字母、從詳解正文移除、回填到答案欄，並連同詳解一起存回 Supabase（`index.html:4858-4863`、`4870`）。改這段邏輯要同時顧到 regex 與 prompt 兩邊一致。

## 題組脈絡（groupCtx）
`generateSol` 會把題組閱讀材料（`PASSAGES[gid].q`）與同題組各小題一起塞進 prompt（`index.html:4840-4846`），並把該題與題組的圖一起送（`_getGroupImgs`）。改題組相關詳解時記得這層 context 存在。

## 四家供應商（共用 sys/msg，只差 call 函式）
`generateSol`／`solChatSend`／`batchGenerateSol` 三處都是同一套 dispatch：
```js
if(provider==='claude') result=await callClaude(sys,msg,key,qImgs);
else if(provider==='gemini') result=await callGemini(sys,msg,key,qImgs);
else if(provider==='ollama'){const olUrl=await resolveOllamaBase();const olMdl=localStorage.getItem('ollamaModel')||'qwen2.5:latest';result=await callOllama(sys,msg,olUrl,olMdl,qImgs);}
else result=await callOpenAI(sys,msg,key,qImgs);
```
- API Key 存 localStorage `aiKey_<provider>` + 雲端 `AI_CFG`（`syllabus_doc` id=3，同事共用同一顆 key）。
- 認證失敗（401／API_KEY_INVALID）會清掉該 provider 的 key 要求重輸（`index.html:4877`）。
- **改詳解格式時，三個進入點的 sys prompt 要一起改**（`solChatSend` 的 sys 是另一段獨立字串，`index.html:4924`），否則「重新生成」對、但「對話修正」後格式跑掉。

## Ollama（本機）連線
- 架構：瀏覽器透過 Tailscale 直接打 Ollama 的 **OpenAI 相容端點** `/v1/chat/completions`，無中介 proxy。詳見 `CLAUDE.md` 第 7 節。
- `resolveOllamaBase()`：對逗號分隔的多個候選網址逐一打 `/api/tags`（3 秒逾時），回第一個連得上的。preset 在 `OLLAMA_PRESETS`（`index.html` 約 2426）。
- 前置條件（缺一不可）：Ollama 主機開機、`OLLAMA_HOST=0.0.0.0`、`OLLAMA_ORIGINS=https://science-qbank.vercel.app`、防火牆放行 11434、瀏覽器允許 mixed content（僅 Chrome/Edge，Safari 無解）。
- 換電腦或重配 Tailscale IP 要回頭改 `OLLAMA_PRESETS` 再 push。

## 修改後驗證
- 純靜態檔，用 `CLAUDE.md` 第 10 節的 `node --check` 抽 `<script>` 檢查語法。
- 實測：開 `index.html`，隨便找一題按「✨ AI 生成詳解」，確認三段標題、LaTeX 單錢字號、無 Markdown、（若無答案）答案有回填。
- 改完 `git push` main，Vercel 自動部署（可用 `deploy` skill）。
