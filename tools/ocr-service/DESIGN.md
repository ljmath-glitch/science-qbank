# 考卷前處理 OCR 服務 — 設計文件（草案）

> 目標讀者：之後接手實作／維護的人（含另一個 Claude）。這份文件記錄「為什麼這樣設計」與「介面契約」，實作細節以程式碼為準。

## 1. 這個工具要解決什麼

現況：raw.html 的「辨識」是**人工把指令＋PDF 貼到外部 AI，再把 CSV 貼回來**（Part I/II），圖表則在 Part III 用本機 Python 工具裁切後匯入。痛點：

- 要手動在網站與 AI 之間來回搬資料（不自動）
- AI 辨識中文＋數學公式品質不穩、要大量人工修
- Part III 圖表座標有時要 AI 猜、或人工框

**新工具目標（依主管確認的優先序）：**

1. **自動化** —— 工讀生在網頁丟掃描檔 → 系統自動辨識 → 直接產出可匯入的 23 欄 CSV，不再手動來回貼
2. **辨識品質更準** —— 中文、數學公式（→LaTeX）、題號、題組、選項對齊
3. **流程更順、好教工讀生**

不要求隱私（雲端可用），但引擎選擇是「公司電腦自架」。

## 2. 關鍵架構真相：OCR ≠ 直接生出 23 欄 CSV

MinerU / dots.ocr 這類工具做的是「看懂版面」：抽出**乾淨文字 + 公式(LaTeX) + 圖表框選座標**。但它們**不會**判斷題庫獨有的分類（領域／單元／子單元／知識點／題型／步驟-記憶-概念分／難度）。這些目前靠大 prompt 交給語言模型判斷。

因此管線是**兩段式**：

```
掃描 PDF（試卷寶清稿後）
   │
   ▼  ① OCR 引擎（公司電腦，CPU）：MinerU pipeline 模式
乾淨文字 + LaTeX 公式 + 圖表框選座標（可精準裁圖）
   │
   ▼  ② 分類引擎（語言模型）：把上面內容填進 23 欄
可匯入的 23 欄 CSV + 已裁好的圖（附題號）
   │
   ▼  匯入題庫（沿用現有 doImport 流程）
```

- 第 ① 段大幅提升辨識準確度，且**圖是用真實座標裁的**（解掉 Part III 讓 AI 猜座標的痛點）
- 第 ② 段只做「分類」，引擎**可選 Ollama qwen（免費/私有）或 Gemini（品質好）**

## 3. 引擎選擇（依硬體：公司電腦無獨顯，只能 CPU）

| 引擎 | 為何選/不選 |
|---|---|
| **MinerU（pipeline 模式）✅ 採用** | 有 CPU 友善的傳統管線（版面偵測＋PaddleOCR 文字＋UnimerNet 公式），無 GPU 也能跑；中文＋公式＋表格最全面；輸出含每個區塊 bbox，利於裁圖 |
| dots.ocr ❌ 暫不用 | 單一視覺大模型(1.7B)，吃 GPU；CPU 上每頁可能數分鐘，太慢 |
| GOT-OCR2 | 公式強、模型小，但仍偏 GPU；列為備選 |

> ⚠️ 無 GPU：每頁約「數十秒級」。少量考卷可接受；量大時加一張便宜 NVIDIA 顯卡或改雲端可大幅加速。UI 用「背景批次」避免卡住工讀生。
> 之後若加顯卡，同一服務可切到 MinerU 的 `vlm` 後端或 dots.ocr，**契約不變、UI 不用動**。

## 4. 部署形態：本機 HTTP 服務，走 Tailscale（比照 Ollama）

- 服務跑在公司電腦（大南路櫃2，與 Ollama 同一台可行），監聽 `0.0.0.0:<port>`
- raw.html 直接 `fetch()` 打服務，經 Tailscale 私網
- 沿用 Ollama 既有的三個伺服器端設定：對外監聽、CORS 放行 `https://science-qbank.vercel.app`、防火牆放行 port
- 混合內容限制同 Ollama：**須用 Chrome/Edge 允許不安全內容；Safari/iPhone 不支援**（工讀生用電腦操作，無妨）
- 精準裁圖複用既有 `tools/extract_question_assets.py`（文字層）與 `tools/crop_scanned_exam_visuals.py`（掃描）的邏輯

## 5. 引擎可抽換的介面契約（重點）

服務對 raw.html 回傳的 JSON（`POST /ocr`，body 為上傳的 PDF）：

```jsonc
{
  "ok": true,
  "engine": "mineru-pipeline",           // 用了哪個引擎（供除錯）
  "exam": "從檔名解析的考試名稱(可選)",
  "pages": [
    {
      "page": 1,
      "width": 1654, "height": 2339,     // 該頁 render 後像素尺寸
      "markdown": "整頁 markdown，行內數學用 $...$",
      "blocks": [
        { "type": "text|formula|figure|table",
          "bbox": [x0, y0, x1, y1],       // 像素座標，對應上面 width/height
          "text": "文字內容(text/table)",
          "latex": "LaTeX(formula/table)",
          "image_b64": "data:image/png;base64,..."  // figure/table 才有：從原頁裁下的圖
        }
      ]
    }
  ]
}
```

- **stage-1（OCR）只回這個**，不做題庫分類。任何引擎（MinerU/dots.ocr/Gemini/Ollama-VL）只要能被包成回傳這個 shape，就能無痛替換。
- **stage-2（分類）在瀏覽器端**：raw.html 把 `markdown` 彙整後，套用現有「23 欄 CSV 產生 prompt」，送給使用者選定的分類引擎（Ollama 或 Gemini），得到 CSV；同時把 `figure/table` 區塊的 `image_b64` 依 LLM 判定的題號，餵進現有「批次貼圖」流程。

## 6. raw.html 整合點

在 Part I 之前（或作為 Part I 的自動化替代）新增「🅐 自動 OCR（本機）」：

1. 服務網址下拉（比照 Ollama：大南路櫃2 / 其他自訂），可多網址 fallback（複用 `resolveOllamaBase()` 概念）
2. 丟入清稿 PDF → 呼叫 `POST /ocr` → 顯示逐頁進度（背景批次）
3. 分類引擎選單：Ollama qwen / Gemini（兩者皆可，沿用 AI_CFG 的 key 與 Ollama 通道）
4. 產出 23 欄 CSV 填入現有匯入框 + 圖表進批次貼圖，全程仍保留「人工確認一次」的關卡

## 7. 檔案配置（本 branch）

```
tools/ocr-service/
  DESIGN.md          # 本文件
  README.md          # 公司電腦安裝/啟動 SOP（Windows 無 GPU）
  題庫OCR_server.py             # FastAPI：POST /ocr，包 MinerU pipeline + 既有裁圖邏輯
  requirements.txt
raw.html             # 新增「自動 OCR」步驟 UI 與串接
CLAUDE.md / guide.html  # 文件更新（架構、SOP、排錯）
```

> Vercel 只當靜態檔發佈，`tools/` 下的 Python 不會被執行，純粹放原始碼與文件，安全無副作用。

## 8. 分階段實作計畫

- **P0（本文件）** 架構與契約定案 ← 現在
- **P1** OCR 服務骨架：`題庫OCR_server.py` 先實作 `POST /ocr` 契約，MinerU pipeline 接上，含健康檢查 `GET /health`；README 安裝 SOP
- **P2** raw.html 前端：服務網址設定、上傳、進度、串 stage-2 分類（Ollama/Gemini 可選）、產 CSV、圖進批次貼圖
- **P3** 文件：CLAUDE.md 第 12 節「OCR 服務」、guide.html SOP、排錯表
- **P4** 端到端試跑一份真考卷、微調 prompt 與裁圖參數

> 全程在 `claude/ocr-prep-tool` 分支開發，**整套完成、主管確認後才一起 commit & push**，不碰 main。
