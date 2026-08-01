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
from fastapi.responses import JSONResponse, HTMLResponse

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


# 讓別台電腦從 https 網站連本服務時，不被 Chrome「私有網路存取(PNA)」擋掉。
@app.middleware("http")
async def allow_private_network(request, call_next):
    resp = await call_next(request)
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


# ── 內建測試頁：直接開 http://localhost:8000/ 就能上傳 PDF 看辨識結果 ──
#    因為頁面與 API 同源(都是 http://localhost)，沒有混合內容/私有網路存取限制。
_TEST_PAGE = """<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OCR 服務測試頁</title>
<style>
body{font-family:system-ui,"Microsoft JhengHei",sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#222}
h1{font-size:20px}.muted{color:#666;font-size:14px}
.drop{border:2px dashed #8bb;border-radius:12px;padding:28px;text-align:center;background:#f6fbff;cursor:pointer;margin:14px 0}
.drop.drag{background:#e6f3ff}
#status{margin:10px 0;font-weight:600}
pre{white-space:pre-wrap;background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;max-height:420px;overflow:auto;font-size:12px}
#figs{display:flex;gap:8px;flex-wrap:wrap}#figs img{height:90px;border:1px solid #ccc;border-radius:6px}
</style></head><body>
<h1>🅐 OCR 服務測試頁</h1>
<p class="muted">丟一份清稿 PDF 進來，看 MinerU 辨識出的文字、公式與圖。這頁由服務本機提供，沒有瀏覽器安全限制。</p>
<div class="muted" id="eng">引擎狀態載入中…</div>
<input id="f" type="file" accept=".pdf" style="display:none" onchange="go(this.files[0])">
<div class="drop" id="d" onclick="f.click()">丟入或點此選擇清稿 PDF → 自動辨識</div>
<div id="status"></div>
<div class="muted" id="summary"></div>
<div id="figs"></div>
<pre id="md"></pre>
<script>
const d=document.getElementById('d');
d.ondragover=e=>{e.preventDefault();d.classList.add('drag')};
d.ondragleave=()=>d.classList.remove('drag');
d.ondrop=e=>{e.preventDefault();d.classList.remove('drag');go(e.dataTransfer.files[0])};
fetch('/health').then(r=>r.json()).then(j=>{document.getElementById('eng').textContent='引擎：'+j.engine+(j.mineru_available?'（MinerU 就緒）':'（mock 假資料）')}).catch(()=>{});
async function go(file){
  if(!file)return;
  const st=document.getElementById('status');
  st.textContent='辨識中…（無 GPU 每頁數十秒，請耐心等）';
  document.getElementById('md').textContent='';document.getElementById('figs').innerHTML='';document.getElementById('summary').textContent='';
  try{
    const fd=new FormData();fd.append('file',file,file.name);
    const r=await fetch('/ocr',{method:'POST',body:fd});
    if(!r.ok)throw new Error('服務回應 '+r.status+'：'+(await r.text()).slice(0,300));
    const j=await r.json();if(!j.ok)throw new Error(j.detail||'辨識失敗');
    const p=j.pages[0];let figs=(p.blocks||[]).filter(b=>b.image_b64);
    document.getElementById('summary').textContent='考試名稱：'+(j.exam||'')+'　偵測到 '+figs.length+' 張圖／表　引擎：'+j.engine;
    const fw=document.getElementById('figs');
    figs.forEach(b=>{const im=document.createElement('img');im.src=b.image_b64;im.title=b.name||'';fw.appendChild(im)});
    document.getElementById('md').textContent=p.markdown||'';
    st.textContent='辨識完成 ✓';
  }catch(e){st.textContent='辨識失敗：'+(e.message||e)}
}
</script></body></html>"""


@app.get("/", response_class=HTMLResponse)
def test_page():
    return _TEST_PAGE


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
