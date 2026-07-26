---
description: 語法檢查 → commit → push main → 輪詢確認 Vercel 上線（茲茲題庫系統一鍵部署）
argument-hint: [commit 訊息，可留空我自己依 diff 產生]
---

你要幫使用者把「茲茲文教自然科題庫系統」的改動一鍵部署上線。這個專案是**純靜態單一 HTML**（index.html / analytics.html / daily.html / progress.html / guide.html / syllabus.js），**push 到 GitHub `main` 分支後 Vercel 會自動部署**到 https://science-qbank.vercel.app 。

請**嚴格依序**執行下列步驟，過程用繁體中文簡短回報，不要多問、能自動判斷就自動做：

## 1. 確認要提交的內容
- 跑 `git status --short` 與 `git diff --stat`，列出這次會提交哪些檔案。
- 若工作區沒有任何變更，直接告訴使用者「沒有可部署的變更」並停止。

## 2. 語法檢查（只檢查有改到的 .html）
對每個**有變更**的 `.html` 檔，抽出 inline `<script>` 跑 `node --check`：
```bash
python3 -c "
import re,sys
html=open(sys.argv[1]).read()
scripts=re.findall(r'<script(?:(?!src=)[^>])*>(.*?)</script>', html, re.S)
open('/tmp/_deploychk.js','w').write('\n;\n'.join(scripts))
" <檔名>
node --check /tmp/_deploychk.js
```
若有變更的是 `syllabus.js` 這類獨立 JS，直接 `node --check <檔名>`。
**任何一個檔語法錯誤就停止**，把錯誤貼給使用者、不要提交。

## 3. commit
- `git add -A`（把所有變更加入）。
- commit 訊息：若 `$ARGUMENTS` 有內容就用它；否則依 diff 自己寫一句簡潔的繁體中文訊息（動詞＋改了什麼）。
- 用 heredoc 提交，並附上專案規定的結尾兩行（Co-Authored-By 與 Claude-Session）。

## 4. push 到 main（Vercel 部署分支）
- 這個專案實際的部署分支是 **`main`**（Vercel webhook 接的是 main）。
- 若目前 HEAD 不在 `main`，但你的新 commit 是 `origin/main` 的直系後代，就 `git branch -f main HEAD` 讓 main 快轉到你的 commit，再 push main。
- push 用重試（失敗等 2s、4s、8s、16s 再試，最多 4 次）：
```bash
for i in 1 2 3 4; do git push origin main && break; echo "retry $i"; sleep $((2**i)); done
```
- **絕對不要** rebase／force-push 已經 push 過的歷史來改「Unverified」簽章徽章——那是 cosmetic，改動已上線的歷史風險太大。

## 5. 驗證 Vercel 已上線
- 從這次改動挑一個**獨特字串**（例如新加的 class 名、函式名、或註解片段）當標記。
- 帶 cache-buster 輪詢對應檔案，最多 5 次、每次間隔 15s，出現標記即代表部署完成：
```bash
for i in 1 2 3 4 5; do
  M=$(curl -sS --cacert /root/.ccr/ca-bundle.crt "https://science-qbank.vercel.app/<檔名>?cb=$(date +%s)" | grep -o "<標記字串>" | head -1)
  if [ -n "$M" ]; then echo "DEPLOYED"; break; fi
  echo "waiting... ($i)"; sleep 15
done
```

## 6. 回報
簡短回報：提交了哪些檔、commit 訊息、是否已確認上線。若使用者要在手機驗證，提醒他清一下快取／硬重整。

> 備註：遠端另有一條 `claude/remote-control-macbook-g87ate` 分支指向與本 session 無關的舊歷史，**不要**去覆蓋它；本專案的上線一律走 `main`。
