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
import json
import os
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
    """呼叫 mineru 命令列，解析它的 content_list.json 成本服務的契約格式。

    mineru 輸出（-b pipeline）大致為：
        <out>/<stem>/auto/<stem>.md
        <out>/<stem>/auto/<stem>_content_list.json
        <out>/<stem>/auto/images/*.jpg
    content_list.json 是「依閱讀順序的區塊清單」，每塊有：
        type: text | equation | image | table | list
        text / text_level / img_path / table_body
        bbox: [x0,y0,x1,y1]（0~1000 正規化）
        page_idx: 0 起算
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

        cl_files = list(out_dir.rglob("*content_list.json"))
        if not cl_files:
            raise RuntimeError("MinerU 沒有產出 content_list.json")
        content_list = json.loads(cl_files[0].read_text(encoding="utf-8"))
        base = cl_files[0].parent  # img_path 相對於這裡

        return _content_list_to_pages(content_list, base)


def _content_list_to_pages(content_list: list[dict], base: Path) -> list[dict]:
    """把 MinerU 的 flat 區塊清單，依 page_idx 收攏成本服務的 pages 格式。"""
    by_page: dict[int, list[dict]] = {}
    for item in content_list:
        pidx = int(item.get("page_idx", 0))
        by_page.setdefault(pidx, []).append(item)

    pages: list[dict] = []
    for pidx in sorted(by_page):
        blocks: list[dict] = []
        md_parts: list[str] = []
        for item in by_page[pidx]:
            t = item.get("type")
            bbox = item.get("bbox", [0, 0, 1000, 1000])
            if t == "text":
                txt = item.get("text", "")
                blocks.append({"type": "text", "bbox": bbox, "text": txt})
                md_parts.append(txt)
            elif t == "list":
                txt = item.get("text", "")
                blocks.append({"type": "text", "bbox": bbox, "text": txt})
                md_parts.append(txt)
            elif t == "equation":
                latex = item.get("text", "").strip()
                blocks.append({"type": "formula", "bbox": bbox, "latex": latex})
                md_parts.append(f"$${latex}$$")
            elif t == "image":
                b64 = _img_to_b64(base, item.get("img_path"))
                blk = {"type": "figure", "bbox": bbox}
                if b64:
                    blk["image_b64"] = b64
                blocks.append(blk)
                md_parts.append("[圖]")
            elif t == "table":
                html = item.get("table_body", "")
                blk = {"type": "table", "bbox": bbox, "latex": html}
                b64 = _img_to_b64(base, item.get("img_path"))
                if b64:
                    blk["image_b64"] = b64
                blocks.append(blk)
                md_parts.append("[表]")
        pages.append({
            "page": pidx + 1,
            "width": 1000,
            "height": 1000,
            "markdown": "\n".join(md_parts),
            "blocks": blocks,
        })
    return pages


def _img_to_b64(base: Path, rel: str | None) -> str | None:
    """把 MinerU 抽出的圖檔讀成 data URI。"""
    if not rel:
        return None
    p = (base / rel)
    if not p.exists():
        # 有些版本 img_path 已含 images/ 前綴或絕對路徑，容錯找一下
        cand = list(base.rglob(Path(rel).name))
        if not cand:
            return None
        p = cand[0]
    mime = "image/jpeg" if p.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("OCR_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
