# 交班：2026-11-03 raw 自動匯題／去除筆跡／橋接（給接手的 Claude／Codex）

## 已上線（main）
- **raw 分兩頁**：`raw.html`＝⚡自動匯題（拼圖工作流：必要 5 步 清除筆跡→自動命名→OCR→題庫 Excel→手動切圖；詳解可選；每步進度條＋秒數＋成果面板）；`raw-manual.html`＝✋手動匯題（還原 11/2 前的逐步版面，原樣保留，不要和自動版混在一起——兩邊欄位 id 相同，放同一頁會互相覆蓋）。
- **去除筆跡（瀏覽器端，tools/dehand.js）**：已改用俊瑋 v10 的灰階三通道 512/48 tile 流程＋模型筆跡機率＋紅藍色筆規則；v10 走 `https://tzutzu-course-system.vercel.app/models/handwriting-eraser-v10.onnx`（該站 CORS=*，備援邏輯在 getSession）。`tools/models/jwmask-r8.onnx` 已在 repo（使用者決定「直接使用、不要移除」）。**勿把 handwriting-eraser-v10.onnx 提交進公開 repo**（工作樹有未追蹤的複本）。
  - 根因：舊版把彩色 RGB 直接送進模型 → 紅藍筆漏擦。
  - **更正（重要）**：先前離線對照圖顯示「括弧鉛筆答案殘留」是**測試腳本沒有先轉正橫放頁**造成的假象。實際上 `Dehand.cleanFile` 會自動轉正；用 `.tmp_dehand_test/s.pdf`（臺北市立石牌國中 111 生物，橫放掃描，**不是**中正國中）經 cleanFile 實測，括弧答案、姓名都清乾淨（僅殘留極少數小點），圖表曲線完整。模型直接對橫放頁推論時才會漏擦。之後離線驗證請務必走 `cleanFile` 或先轉正。已知小問題：灰底網紋的小方框（如營養標示）清稿後會出現點狀雜訊。
  - 注意：使用者的中正國中 4 頁原檔不在 `.tmp_dehand_test`（s/w/t 分別是石牌、復興、花壇）；要驗收「紅字答案、算式、張貝希、92」請請使用者提供該檔。
- **AI 健檢橋接**：`tools/agy_bridge.cjs`（埠 8790，避開 OCR 服務的 8787）＋桌面「啟動AI橋接」（`tools/start_agy_bridge.command`，用 `tailscale serve --bg --https=8790 8790`；**不要動 443/8443，那是茲茲 OCR 用的**）。組卷精靈第 3 步「管理員工具」可貼連線碼；沒橋接時改用使用者自己的 Gemini 金鑰（不讀雲端共用金鑰）。
- **raw 的 OCR 主機固定公司電腦** `https://ljm2222.tail3d3c18.ts.net:8443`（使用者決定）。原本的「使用者本機」選項其實連到 chias-macbook-pro，已移除。
- 考題分析中心 01 命題總覽、04 題型與難度已上線。

## 未完成／待辦
1. 去除筆跡：用使用者提供的中正國中原檔再驗一次；灰網紋小框的點狀雜訊。
2. **OCR 系統（獨立 repo Boss-fu/exam-answer-key-formatter，私有）**：伺服器端去除筆跡（`ocr/clean_pdf.py`，本應用 jwmask-r8 hand 模式）實測也擦不乾淨，且 `local-app/public/eraser.html` 要重做成進度／逐頁成果介面。Codex 在額度用完前留下**未驗收的半成品**（local-app/public/eraser.html、local-app/server.js、ocr/clean_pdf.py），與其他人的未提交改動混在同一工作樹，**沒有推送**；接手前先 `git diff` 看清楚。
3. 使用者要求「運算方式三模式」：瀏覽器內／本機引擎／遠端電腦（Tailscale）；模型放雲端可下載（使用者已決定公開使用現有模型）。設計草稿見 `docs/product/ocr-engine-modes.md`（Codex 產出、未審）。其他使用者不裝 Tailscale 也要能用 OCR 是目標。
4. 整合 OCR 系統功能進 raw：階段 1（OCR 主線收斂、記住 jobId、`OcrApi` 風格錯誤處理）、階段 2（`runAutoOcr` 把 `pages` 固定寫成 `[]`，OCR 圖表不進切圖清單。**使用者決定切圖先維持手動，不要自動帶入**：2026-11-03 做過下載 `figures` 轉 cropCandidates 的版本（e8f48df），上線後已撤回；要重做先問使用者）；人工校正與詳解工作區先留在 OCR 系統（盤點結論）。
5. 拼圖流程盤步驟 3～8 的接線只用模擬狀態驗證過，需用真實 OCR 跑一次確認。
6. 兩個舊測試本來就失敗（非本次造成）：`tools/test_solution_rules.cjs`、`tools/test_word_latex.cjs`。

## 工作方式提醒
- 使用者規則：Claude 派工＋驗收＋push；Codex 做大改；繁中回覆。每個功能改動同步更新 `guide.html` 與 `changelog.json`（build 進位）。
- **Codex 常見故障**：(a) 登入過期 → `codex login`，之後要關掉舊的 plugin broker（`pkill -f app-server-broker.mjs` 及其 app-server 子程序）才會吃到新 token；(b) 可寫範圍取決於啟動時的工作目錄（要改 OCR repo 必須在該 repo 目錄下啟動）；(c) 用量額度（回報會寫恢復時間，曾為 21:39）。
- 提交時**逐檔 `git add`**，不要 `git add -A`（工作樹常有別的工作階段／Codex 的未驗收改動；曾誤把 syllabus 改動一起推上去）。更新 `changelog.json` 前先 `git fetch`，避免與其他工作階段的條目衝突（id／build 要在最新 origin/main 上遞增）。
- 預覽：`.claude/launch.json` 有靜態伺服器設定（port 8123）；本機測試解鎖鎖定頁可在 sessionStorage 設 `tzutzu_qbank_unlock_until`。

## 2026-11-04 補充
- 橋接：支援 agy／claude／codex 自動挑選與快速設定（claude 用 haiku、codex 用 gpt-6-luna＋low、agy --effort low）；AI 補齊明細改為「緊湊提示」（編號選單元＋本地相似題沿用知識點，12 題約 15 秒）。啟動AI橋接的連接埠檢查要看 127.0.0.1（Tailscale 自己會佔 8790）。
- 理化新增大單元 C0 進入實驗室（syllabus.js 的 EXTRA_SYLLABUS＋index.html mergeSyllabusProfiles 補進雲端課綱）。
- 資料庫已直接把 48 題改分到 C0（book JB3／八上理化）。備份表 `public.questions_backup_c0_20261104`（RLS 已開、無 policy）。復原：
  `update public.questions q set book=b.book,book_name=b.book_name,field=b.field,unit=b.unit,sub=b.sub,kp=b.kp,updated_at=now() from public.questions_backup_c0_20261104 b where q.id=b.id;`
- 還沒做完：AI 判斷了 464 題候選中的全部，但我只搬了高信心的 48 題；「天平／量筒讀數／過濾／製備氧氣」等被刻意保留在原單元，若要搬可再用資料管理的「重分類：進入實驗室」逐題預覽處理。

## 2026-11-04 04:50 資料庫補標籤（直接對 Supabase 執行，已完成）
- 補分析標籤：353 題缺題型／難度／圖表類型／單元明細（只補空白欄位），Codex（gpt-6-luna）判斷、REST PATCH 寫入。備份表 `public.questions_backup_tags_20261104`（id,type,step,mem,con,chart,book,book_name,field,unit,sub,kp,summary）。
  復原：`update public.questions q set type=b.type,step=b.step,mem=b.mem,con=b.con,chart=b.chart,book=b.book,book_name=b.book_name,field=b.field,unit=b.unit,sub=b.sub,kp=b.kp,summary=b.summary,updated_at=now() from public.questions_backup_tags_20261104 b where q.id=b.id;`
- 難度重評：3178 題原為 2/2/2（疑似預設值）由 Codex 重評，其中 1698 題分數改變、1480 題維持 2/2/2。備份表 `public.questions_backup_diff_20261104`（id,step,mem,con）。復原：`update public.questions q set step=b.step,mem=b.mem,con=b.con,updated_at=now() from public.questions_backup_diff_20261104 b where q.id=b.id;`
- 結果：缺題型／難度／圖表／單元明細全部 0 題。新難度分布：簡單 2625／中等 2950／困難 1585／極難 196。
- 腳本在 scratchpad（不入版控）：fill.cjs（補標籤）、rescore.cjs（難度重評）、apply*.cjs。
