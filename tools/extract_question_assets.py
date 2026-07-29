#!/usr/bin/env python3
"""從有文字層的乾淨考卷 PDF 裁切題目圖、表，建立可供題庫匯入的素材包。

這是本機工具，不會把考卷上傳到任何服務。它只裁切原 PDF 既有內容，
不重繪、不補字，也不以 AI 猜測缺失的圖表。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import pdfplumber
from PIL import Image


# Word 產出的 PDF 常把「1.(C)」拆成「1.(」「C」「)」，故不可只接受 1.。
QUESTION_RE = re.compile(r"^(\d+)\.?(?:\(|（)?$")
CAPTION_RE = re.compile(r"^(圖|表|附表|Figure|Table)")
# 不把「波形、圖書」這類單字當成題目圖片證據；必須是題幹真的指向圖或表。
REFERENCE_RE = re.compile(r"如下圖|如圖|下圖|圖所示|圖中|題圖|圖示|附表|如下表|下表|表所示|表中")


def safe_name(text: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", text).strip("_") or "考卷"


def overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    iw, ih = max(0, min(ax1, bx1) - max(ax0, bx0)), max(0, min(ay1, by1) - max(ay0, by0))
    return (iw * ih) / max(1, (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - iw * ih)


def merge_boxes(boxes: list[tuple[float, float, float, float]], gap: float = 10) -> list[tuple[float, float, float, float]]:
    """合併重疊或相距很近的 PDF 物件，避免同一示意圖被切成數張。"""
    pending = boxes[:]
    merged: list[tuple[float, float, float, float]] = []
    while pending:
        x0, top, x1, bottom = pending.pop(0)
        changed = True
        while changed:
            changed = False
            for i, (a0, at, a1, ab) in enumerate(pending):
                intersects = not (a1 + gap < x0 or x1 + gap < a0 or ab + gap < top or bottom + gap < at)
                if intersects:
                    x0, top, x1, bottom = min(x0, a0), min(top, at), max(x1, a1), max(bottom, ab)
                    pending.pop(i)
                    changed = True
                    break
        merged.append((x0, top, x1, bottom))
    return merged


def question_anchors(words: list[dict]) -> list[tuple[int, float]]:
    anchors: list[tuple[int, float]] = []
    for word in words:
        match = QUESTION_RE.match(word["text"])
        if match and word["x0"] < 100:  # 排除算式、選項內的數字
            anchors.append((int(match.group(1)), word["top"]))
    return sorted(set(anchors), key=lambda value: value[1])


def owner_question(top: float, anchors: list[tuple[int, float]], page_height: float) -> int | None:
    for index, (number, start) in enumerate(anchors):
        # 題幹的 baseline 偶爾比題號高 0.x pt；預留邊界避免下一題文字被併入本題。
        end = anchors[index + 1][1] - 4 if index + 1 < len(anchors) else page_height
        if start - 5 <= top < end:
            return number
    return None


def referenced_question(box: tuple[float, float, float, float], anchors: list[tuple[int, float]], words: list[dict], page_height: float) -> int | None:
    """優先使用題幹的「如下圖／附表」語意，處理圖放在題號上方的 Word 排版。"""
    sections: list[tuple[int, float, float, str]] = []
    for index, (number, start) in enumerate(anchors):
        end = anchors[index + 1][1] - 4 if index + 1 < len(anchors) else page_height
        text = "".join(word["text"] for word in words if start - 3 <= word["top"] < end)
        sections.append((number, start, end, text))
    centre = (box[1] + box[3]) / 2
    candidates = []
    for number, start, end, text in sections:
        if REFERENCE_RE.search(text):
            distance = 0 if start - 15 <= centre <= end + 15 else min(abs(centre - start), abs(centre - end))
            candidates.append((distance, number))
    if candidates:
        distance, number = min(candidates)
        # 只有當題幹確實在圖旁時才覆蓋依位置得到的題號，避免拿到遙遠的其他題圖。
        if distance < 140:
            return number
    # 沒有題幹引用就不猜。這會排除頁首、出版社 logo、裝飾圖片與答案標記。
    return None


def nearby_caption(words: list[dict], box: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    x0, top, x1, bottom = box
    candidates = []
    for word in words:
        close_below = bottom - 2 <= word["top"] <= bottom + 32
        horizontally_related = word["x1"] >= x0 - 12 and word["x0"] <= x1 + 80
        if close_below and horizontally_related and CAPTION_RE.match(word["text"]):
            candidates.append(word)
    if not candidates:
        return None
    return (min(word["x0"] for word in candidates), min(word["top"] for word in candidates),
            max(word["x1"] for word in candidates), max(word["bottom"] for word in candidates))


def render_page(pdf_path: Path, page_number: int, dpi: int, render_dir: Path) -> Path:
    target = render_dir / f"page-{page_number:02d}.png"
    if target.exists():
        return target
    prefix = render_dir / f"page-{page_number:02d}"
    subprocess.run(["pdftoppm", "-f", str(page_number), "-l", str(page_number), "-r", str(dpi), "-png", "-singlefile", str(pdf_path), str(prefix)], check=True)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="裁切乾淨 PDF 中的題目圖表。")
    parser.add_argument("pdf", type=Path, help="具文字層的乾淨考卷 PDF")
    parser.add_argument("--output", "-o", type=Path, help="輸出資料夾（預設為 PDF 同層 assets）")
    parser.add_argument("--dpi", type=int, default=220, help="輸出 PNG 解析度，預設 220")
    args = parser.parse_args()
    pdf_path = args.pdf.expanduser().resolve()
    if not pdf_path.exists():
        parser.error(f"找不到 PDF：{pdf_path}")
    if shutil.which("pdftoppm") is None:
        parser.error("缺少 pdftoppm；請安裝 Poppler 後重試。")

    output = (args.output or pdf_path.with_name(f"{safe_name(pdf_path.stem)}_圖表素材")).resolve()
    output.mkdir(parents=True, exist_ok=True)
    render_dir = output / ".rendered-pages"
    render_dir.mkdir(exist_ok=True)
    manifest: list[dict] = []
    used_names: defaultdict[str, int] = defaultdict(int)
    skipped_unlinked = 0

    with pdfplumber.open(pdf_path) as document:
        for page_index, page in enumerate(document.pages, start=1):
            words = page.extract_words(use_text_flow=True, keep_blank_chars=False)
            anchors = question_anchors(words)
            raw_images = []
            for image in page.images:
                box = (image["x0"], image["top"], image["x1"], image["bottom"])
                if (box[2] - box[0]) * (box[3] - box[1]) >= 900:  # 排除極小裝飾物與圖示
                    raw_images.append(box)
            image_boxes = merge_boxes(raw_images)

            table_boxes = []
            try:
                table_boxes = [tuple(table.bbox) for table in page.find_tables()]
            except Exception:
                pass
            candidates = [("表格", box) for box in table_boxes]
            candidates += [("圖表", box) for box in image_boxes if not any(overlap(box, table) > .55 for table in table_boxes)]

            for kind, original_box in candidates:
                # 頁首 logo、考卷名稱帶常被 Word 輸出成 image XObject；絕不可視為第 1 題素材。
                if anchors and original_box[1] < anchors[0][1] - 8:
                    skipped_unlinked += 1
                    continue
                owner = referenced_question(original_box, anchors, words, page.height)
                if owner is None:
                    skipped_unlinked += 1
                    continue
                caption = nearby_caption(words, original_box)
                x0, top, x1, bottom = original_box
                if caption:
                    x0, top, x1, bottom = min(x0, caption[0]), min(top, caption[1]), max(x1, caption[2]), max(bottom, caption[3])
                margin = 8
                x0, top = max(0, x0 - margin), max(0, top - margin)
                x1, bottom = min(page.width, x1 + margin), min(page.height, bottom + margin)
                primary = f"Q{owner}" if owner is not None else "Q未知"
                base = f"{primary}_{kind}_請人工確認"
                used_names[base] += 1
                suffix = "" if used_names[base] == 1 else f"_{used_names[base]}"
                filename = f"{base}{suffix}.png"
                page_image_path = render_page(pdf_path, page_index, args.dpi, render_dir)
                with Image.open(page_image_path) as page_image:
                    scale = args.dpi / 72
                    pixels = tuple(round(value * scale) for value in (x0, top, x1, bottom))
                    page_image.crop(pixels).save(output / filename)
                manifest.append({
                    "file": filename, "page": page_index, "kind": kind, "primary_question": owner,
                    "shared_questions": [], "needs_review": True,
                    "review_reason": "自動定位：請確認圖表範圍、題號關聯與中文描述。",
                    "bbox_pt": {"x0": round(x0, 1), "top": round(top, 1), "x1": round(x1, 1), "bottom": round(bottom, 1)},
                })

    (output / "manifest.json").write_text(json.dumps({"source_pdf": str(pdf_path), "dpi": args.dpi, "assets": manifest,
        "skipped_unlinked_candidates": skipped_unlinked}, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "README.txt").write_text(
        "本資料夾的 PNG 都是由原始 PDF 頁面裁切而來，沒有重繪或補圖。\n"
        "檔名暫以 Q題號_圖表／表格_請人工確認 命名；確認後可改成具體描述，再匯入題庫。\n"
        "manifest.json 保留頁碼、裁切座標和人工覆核狀態。\n", encoding="utf-8")
    zip_path = output.with_suffix(".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in output.iterdir():
            if path.is_file():
                archive.write(path, path.name)
    shutil.rmtree(render_dir, ignore_errors=True)
    print(f"完成：{len(manifest)} 張素材，略過 {skipped_unlinked} 張未被題幹引用的候選，輸出至 {output}\n可直接匯入題庫的 ZIP：{zip_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
