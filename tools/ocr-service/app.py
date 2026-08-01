#!/usr/bin/env python3
"""茲茲題庫 — 考卷前處理 OCR 後端服務。

這是「後端」：跑在公司電腦上，聽瀏覽器（raw.html）的請求，用 MinerU 把清稿 PDF
辨識成「乾淨文字 + 數學 LaTeX + 圖表」，回傳一包固定格式的 JSON（見 DESIGN.md 第 5 節）。

兩種引擎：
  - mock  ：假資料，任何電腦不用裝 MinerU 就能跑，用來先開發/測試前端。
  - mineru：真的，呼叫 `mineru` 命令列（純 CPU：-b pipeline）並解析它的輸出。

用環境變數 OCR_ENGINE 切換（預設 mock）。啟動方式見 README.md。
"""
from __future__ import annotations

import base64
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── 設定（用環境變數覆蓋，不用改程式）────────────────────────────
OCR_ENGINE = os.environ.get("OCR_ENGINE", "mock").lower()       # mock | mineru
MINERU_BACKEND = os.environ.get("MINERU_BACKEND", "pipeline")     # 無 GPU 用 pipeline
MINERU_LANG = os.environ.get("MINERU_LANG", "ch")                # 中文
MINERU_CMD = os.environ.get("MINERU_CMD", "mineru")             # mineru 執行檔路徑
# CORS：預設放行正式站；設成 * 可全放行（開發用）
ALLOW_ORIGIN = os.environ.get(
    "OCR_ALLOW_ORIGIN", "https://science-qbank.vercel.app"
)

app = FastAPI(title="qbank-ocr-service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOW_ORIGIN == "*" else [ALLOW_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 健康檢查：前端用來測「這個網址通不通」（比照 Ollama 的 /api/tags）──
@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": OCR_ENGINE,
        "mineru_available": shutil.which(MINERU_CMD) is not None,
    }


# ── 主要端點：上傳 PDF → 回傳辨識結果 ───────────────────────────
@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="沒有收到檔案內容")
    exam = Path(file.filename or "考卷").stem
    try:
        if OCR_ENGINE == "mineru":
            pages = run_mineru(data)
        else:
            pages = run_mock(data)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"找不到 {MINERU_CMD} 命令，請確認 MinerU 已安裝")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"MinerU 執行失敗：{e}")
    return JSONResponse(
        {"ok": True, "engine": OCR_ENGINE, "exam": exam, "pages": pages}
    )


# ── 引擎 A：mock（假資料，先打通前端用）──────────────────────────
def run_mock(_pdf_bytes: bytes) -> list[dict]:
    """回傳一頁假資料，格式跟真的一模一樣，方便先開發前端。"""
    return [
        {
            "page": 1,
            "width": 1000,
            "height": 1000,
            "markdown": (
                "1. 下列何者為純物質？\n"
                "(A) 空氣 (B) 海水 (C) 蒸餾水 (D) 糖水\n\n"
                "2. 一物體以等速度運動，其加速度為 $a = 0$，"
                "若質量 $m = 2\\,\\mathrm{kg}$，則合力 $F = ma = 0$。\n\n"
                "（此為 mock 假資料，裝好 MinerU 後改用真辨識）"
            ),
            "blocks": [
                {"type": "text", "bbox": [80, 60, 920, 110],
                 "text": "1. 下列何者為純物質？"},
                {"type": "text", "bbox": [80, 120, 920, 170],
                 "text": "(A) 空氣 (B) 海水 (C) 蒸餾水 (D) 糖水"},
                {"type": "formula", "bbox": [80, 260, 620, 320],
                 "latex": "F = ma = 0"},
                {"type": "figure", "bbox": [120, 380, 520, 720],
                 "image_b64": _TINY_PNG},
            ],
        }
    ]


# 1x1 透明 PNG（mock 圖用）
_TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


# ── 引擎 B：mineru（真的）──────────────────────────────────────
def run_mineru(pdf_bytes: bytes) -> list[dict]:
    """呼叫 mineru 命令列，回傳「整份 markdown + 抽出的圖」。

    MinerU 3.4.x（-b pipeline）輸出：
        <out>/<stem>/auto/<stem>.md          ← 完整 markdown（文字/表格HTML/LaTeX/<img>）
        <out>/<stem>/auto/images/*.jpg       ← 抽出的圖、表

    我們以 markdown 為主（跨版本穩定），不去硬解各版本格式不一的 content_list*.json。
    圖只回傳「markdown 內真的有 <img> 引用到」的，避免夾帶一堆表格碎圖。
    """
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        pdf_path = tmp / "input.pdf"
        pdf_path.write_bytes(pdf_bytes)
        out_dir = tmp / "out"
        out_dir.mkdir()

        subprocess.run(
            [MINERU_CMD, "-p", str(pdf_path), "-o", str(out_dir),
             "-b", MINERU_BACKEND, "-l", MINERU_LANG],
            check=True, capture_output=True, text=True,
        )

        md_files = list(out_dir.rglob("*.md"))
        if not md_files:
            raise RuntimeError("MinerU 沒有產出 markdown")
        md_path = max(md_files, key=lambda p: p.stat().st_size)
        base = md_path.parent
        markdown = md_path.read_text(encoding="utf-8")

        # 依 markdown 內出現順序，挑出真的被引用到的圖檔名（去重）
        blocks: list[dict] = []
        seen: set[str] = set()
        for m in re.finditer(r'images/([^\s"\')<>]+)', markdown):
            name = m.group(1)
            if name in seen:
                continue
            seen.add(name)
            p = base / "images" / name
            if not p.exists():
                cand = list(base.rglob(name))
                if not cand:
                    continue
                p = cand[0]
            blocks.append({"type": "figure", "name": name,
                           "image_b64": _img_to_b64(p)})

        return [{
            "page": 1,
            "width": 1000,
            "height": 1000,
            "markdown": markdown,
            "blocks": blocks,
        }]


def _img_to_b64(p: Path) -> str:
    """把圖檔讀成 data URI。"""
    mime = "image/jpeg" if p.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("OCR_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
