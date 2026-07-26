---
name: qbank-data-normalize
description: 茲茲文教自然科題庫系統的 Supabase questions 資料表欄位正規化與稽核。當使用者要「正規化／清理／統一」某個欄位（圖表類型、題型、領域、冊次、難度、年度等）、盤點某欄位的值分布、把舊格式/自由填寫的值對應到固定分類、或用 Gemini 批次分類補齊未分類資料時使用。關鍵字：正規化、圖表類型、題型分類、領域修正、冊次、欄位清理、批次更新、Supabase、Gemini 分類、資料稽核、待確認。
---

# 題庫資料正規化 SOP

對 Supabase `questions` 表做欄位正規化／稽核。**核心原則：先盤點、先備份、高信心才自動改、拿不準就標待確認或交 Gemini、改完驗證筆數。絕不亂猜硬改。**

## 連線資訊（anon publishable key，本來就設計給前端用，非機密）
- `SUPABASE_URL = https://esfepufqyeplafzbeeag.supabase.co`
- `KEY = sb_publishable_P_OpGwKYuWxpHMHCZdQRPA_1lCCLfNf`
- REST 端點：`{URL}/rest/v1/questions`，header 帶 `apikey` 與 `Authorization: Bearer {KEY}`。
- 只針對**題目**（`type=neq.passage`），題組文章不算。

## 標準流程
1. **盤點分布**：`node scripts/fetch_distribution.mjs <欄位名>` 印出該欄位所有值與筆數，找出不符合規範的值。
2. **備份**：套用任何更新前先 `node scripts/backup_column.mjs <欄位名...>`，把現值存成 JSON，供回溯。
3. **分兩層處理**：
   - **Tier 1 高信心對照**：舊值／自由寫法明確等於某固定值（如「波形圖→波動圖」「資料表→表格」），建字典直接批次改名。
   - **拿不準的**：不要硬塞進某類。可（a）把 `flag` 設 true 標記待確認、在 `basis` 註記原因；或（b）用 Gemini 批次分類（需使用者提供 Gemini API key，見下）。
4. **套用更新**：用 PATCH。整批同值：`PATCH {URL}/rest/v1/questions?<欄位>=eq.<舊值>&type=neq.passage`，body `{"<欄位>":"<新值>","updated_at":"<ISO>"}`，header 加 `Content-Type: application/json`、`Prefer: return=representation`，回傳陣列長度即受影響筆數。逐題則用 `id=eq.<id>`。
5. **驗證**：比對「預期筆數 vs 實際受影響筆數」是否吻合；再跑一次 fetch_distribution 確認分布已收斂。
6. **回報**：改了幾筆、標了幾筆待確認、還有哪些無法可靠判斷。

## Gemini 批次分類（需要看圖或看題幹判斷時）
- 用 `gemini-2.5-flash`，端點 `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<KEY>`。
- **務必**在 `generationConfig` 加 `thinkingConfig:{thinkingBudget:0}`，否則會被 thinking 吃光 token、回空。
- 省 token：一次塞多題（純文字批 25 題／含圖批 6 題）；只有真的要看圖才送圖（圖是 Supabase Storage 公開 URL，先 fetch 成 base64）。
- 輸出要求回「長度=題數的 JSON 整數陣列」對應分類代碼，`temperature:0`。
- 分類前先抽樣打開幾張圖人工核對 prompt 準不準，錯了就修 prompt 再全跑；每輪都抽查再套用。

## 固定分類參考（正式統計只認這些）
- **圖表類型（12 類）**：無／表格／函數關係圖／運動圖／統計圖／電路圖／光學圖／波動圖／場線／等值線圖／微觀模型圖／實驗裝置圖／力學示意圖。不可自創、不可填「其他」「情境示意圖」。空白且無圖→「無」；空白但題幹提「如圖」卻沒上傳圖→標待確認、`basis` 註記缺圖。
- **題型（17 類代碼）**：A1 A2 A3／B1 B2 B3／C1 C2 C3／D1 D2 D3／E1 E2 E3／填／計。
- **領域**：國中 = 生物／理化／地科；高中 = 物理／化學／生物／地科。國高中分開，不混統計。
- **冊次骨架**：見 repo 的 `syllabus.js`（翰林國中＋龍騰高中課綱）。冊次/大單元/子單元不在骨架者，列「章節分類待正規化」，不要自行改名。

## 安全提醒
- 只有一個正式 Supabase，沒有 dev/staging，改的是**正式資料**：務必先備份、批次前先小量試 PATCH 確認權限與格式。
- 只做 UPDATE，不要 DELETE。改完把備份 JSON 路徑告訴使用者。
