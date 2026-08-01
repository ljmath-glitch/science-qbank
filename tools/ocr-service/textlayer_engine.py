#!/usr/bin/env python3
"""文字層引擎：給「有文字層的乾淨 PDF」用。

- 題幹/選項文字：直接從 PDF 文字層讀（乾淨、不受外框影響）。
- 表格與圖：用線條/影像物件偵測，整塊裁成圖片，並對應到題號（滿足「表格一定要當圖」）。

重用同層上一層 tools/extract_question_assets.py 既有的裁圖邏輯，避免重造。
回傳與 app.py 契約一致：pages[0].markdown（乾淨文字）+ blocks（每張圖含 type/kind/qno/image_b64）。

需要 poppler 的 pdftoppm（向量表格要靠整頁渲染再裁）。
"""
from __future__ import annotations

import base64
import importlib.util
import io
import tempfile
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

# 載入上一層的 extract_question_assets.py（重用其裁圖/題號關聯邏輯）
_EQA_PATH = Path(__file__).resolve().parent.parent / "extract_question_assets.py"
_spec = importlib.util.spec_from_file_location("extract_question_assets", _EQA_PATH)
eqa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eqa)


def has_text_layer(pdf_bytes: bytes, min_chars: int = 200) -> bool:
    """判斷 PDF 是否有可用文字層（用來自動決定走文字層或 MinerU）。"""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
            total = sum(len((p.extract_text() or "")) for p in doc.pages[:3])
        return total >= min_chars
    except Exception:
        return False


def _b64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _question_texts(words: list[dict], anchors: list[tuple[int, float]], page_height: float) -> dict[int, str]:
    """把每個題號到下一個題號之間的文字，收成該題的乾淨題幹文字。"""
    out: dict[int, str] = {}
    for i, (num, start) in enumerate(anchors):
        end = anchors[i + 1][1] - 4 if i + 1 < len(anchors) else page_height
        text = "".join(w["text"] for w in words if start - 3 <= w["top"] < end)
        out[num] = text
    return out


def run_textlayer(pdf_bytes: bytes, dpi: int = 220) -> list[dict]:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        pdf_path = tmp / "input.pdf"
        pdf_path.write_bytes(pdf_bytes)

        # 用 pypdfium2 渲染整頁（免裝 poppler），供向量表格裁切；每頁只渲染一次。
        pdfium_doc = pdfium.PdfDocument(str(pdf_path))
        _page_cache: dict[int, Image.Image] = {}

        def rendered_page(page_index: int) -> Image.Image:
            if page_index not in _page_cache:
                bmp = pdfium_doc[page_index - 1].render(scale=dpi / 72)
                _page_cache[page_index] = bmp.to_pil().convert("RGB")
            return _page_cache[page_index]

        md_parts: list[str] = []
        blocks: list[dict] = []

        with pdfplumber.open(pdf_path) as document:
            for page_index, page in enumerate(document.pages, start=1):
                words = page.extract_words(use_text_flow=True, keep_blank_chars=False)
                anchors = eqa.question_anchors(words)

                # 每題乾淨文字 → markdown（給分類用）；文字本身已含題號，不再重複加。
                for num, text in sorted(_question_texts(words, anchors, page.height).items()):
                    md_parts.append(text.strip())

                # 候選：表格（find_tables）+ 圖（image XObject 群組）
                raw_images = [im for im in page.images
                              if (im["x1"] - im["x0"]) * (im["bottom"] - im["top"]) >= 900]
                image_groups = eqa.merge_image_groups(raw_images)
                # 只留「真正的小資料表」：丟掉版面大格子（佔頁面過大、或縱向跨到多個題號）
                page_area = page.width * page.height
                table_boxes = []
                try:
                    for t in page.find_tables():
                        x0, top, x1, bot = t.bbox
                        area_frac = ((x1 - x0) * (bot - top)) / page_area
                        spanned = sum(1 for _n, y in anchors if top - 3 <= y < bot + 3)
                        if area_frac > 0.28 or spanned >= 2:
                            continue  # 版面大格子，不是資料表
                        table_boxes.append((x0, top, x1, bot))
                except Exception:
                    table_boxes = []
                candidates = [("表格", box, None) for box in table_boxes]
                for group in image_groups:
                    box = (min(i["x0"] for i in group), min(i["top"] for i in group),
                           max(i["x1"] for i in group), max(i["bottom"] for i in group))
                    if not any(eqa.overlap(box, t) > .55 for t in table_boxes):
                        candidates.append(("圖表", box, group))

                for kind, box, raw_group in candidates:
                    # 頁首 logo/裝飾（在第一題之前）不要
                    if anchors and box[1] < anchors[0][1] - 8:
                        continue
                    owner = eqa.referenced_question(box, anchors, words, page.height)
                    if owner is None:
                        continue
                    x0, top, x1, bottom = box
                    if raw_group is not None:
                        img = eqa.render_raw_group(raw_group, box, dpi)
                    else:
                        m = 8
                        x0, top = max(0, x0 - m), max(0, top - m)
                        x1, bottom = min(page.width, x1 + m), min(page.height, bottom + m)
                        pim = rendered_page(page_index)
                        scale = dpi / 72
                        px = tuple(round(v * scale) for v in (x0, top, x1, bottom))
                        img = pim.crop(px)
                    blocks.append({
                        "type": "table" if kind == "表格" else "figure",
                        "kind": kind,
                        "qno": owner,
                        "page": page_index,
                        "image_b64": _b64_png(img),
                    })

        return [{
            "page": 1,
            "width": 1000,
            "height": 1000,
            "markdown": "\n\n".join(md_parts),
            "blocks": blocks,
        }]
