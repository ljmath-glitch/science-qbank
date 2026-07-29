#!/usr/bin/env python3
"""保守裁切掃描考卷中的圖、表素材。

用途：處理沒有文字層的乾淨掃描 PDF。程式先用 Tesseract 找出文字，
把文字區遮罩後只保留非文字的墨跡區塊（圖、座標軸、表格線、照片），
因此不會把整段題幹或選項當成圖片輸出。

這不是重繪工具：輸出一律是原始 PDF 頁面的裁切。無法確認題號時不猜測，
以 Q未知 命名並在 manifest 標為 needs_review。
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


QUESTION_RE = re.compile(r"^(\d{1,3})[\.．、]?$")
IMAGE_SUFFIXES = {".pdf"}


def safe_name(text: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", text).strip("_") or "考卷"


def runs(values: np.ndarray, minimum: int = 1) -> list[tuple[int, int]]:
    """取得布林陣列中連續 True 的 [start, end) 範圍。"""
    out: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(values.tolist() + [False]):
        if value and start is None:
            start = i
        elif not value and start is not None:
            if i - start >= minimum:
                out.append((start, i))
            start = None
    return out


def render_pages(pdf: Path, dpi: int, target: Path) -> list[Path]:
    prefix = target / "page"
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", str(pdf), str(prefix)], check=True)
    return sorted(target.glob("page-*.png"))


def ocr_words(image_path: Path) -> list[dict]:
    """呼叫系統 Tesseract TSV；失敗時回傳空文字，不中斷裁切。"""
    try:
        completed = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "chi_tra+eng", "--psm", "6", "tsv"],
            check=True, text=True, encoding="utf-8", errors="replace", capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return []
    rows = csv.DictReader(completed.stdout.splitlines(), delimiter="\t")
    words = []
    for row in rows:
        text = (row.get("text") or "").strip()
        if not text:
            continue
        try:
            conf = float(row.get("conf") or -1)
            x, y = int(row["left"]), int(row["top"])
            w, h = int(row["width"]), int(row["height"])
        except (KeyError, ValueError):
            continue
        if conf >= 20 and w > 0 and h > 0:
            words.append({"text": text, "x0": x, "y0": y, "x1": x + w, "y1": y + h})
    return words


def text_mask(shape: tuple[int, int], words: list[dict], padding: int = 7) -> np.ndarray:
    height, width = shape
    mask = np.zeros(shape, dtype=bool)
    for word in words:
        x0 = max(0, word["x0"] - padding); x1 = min(width, word["x1"] + padding)
        y0 = max(0, word["y0"] - padding); y1 = min(height, word["y1"] + padding)
        mask[y0:y1, x0:x1] = True
    return mask


def candidate_boxes(image: Image.Image, words: list[dict], tile: int, min_tiles: int) -> list[tuple[int, int, int, int]]:
    """只用長直線建立候選，避免把段落文字當成圖片。

    表格邊框、座標軸、電路圖和裝置圖通常都有長橫線／長直線；中文題幹即使
    OCR 漏辨，也不會形成數十像素的連續黑線。這比「整塊墨跡密度」保守很多。
    """
    gray = np.asarray(image.convert("L"))
    dark = gray < 150
    height, width = dark.shape
    min_line = max(55, tile * 2)
    line_boxes: list[tuple[int, int, int, int]] = []
    for y in range(height):
        for x0, x1 in runs(dark[y], min_line):
            if x1 - x0 < width * .92:
                line_boxes.append((x0, max(0, y - 2), x1, min(height, y + 3)))
    for x in range(width):
        for y0, y1 in runs(dark[:, x], min_line):
            # 排除雙欄考卷的整頁分隔線；表格直線不會幾乎貫穿整頁。
            if y1 - y0 < height * .78:
                line_boxes.append((max(0, x - 2), y0, min(width, x + 3), y1))
    grouped = merge_boxes(line_boxes, gap=max(24, tile))
    boxes = []
    for x0, y0, x1, y1 in grouped:
        if y0 < height * .10:
            continue
        # 分欄線、題目外框與頁面裝飾常形成很大的矩形，不是題目圖表。
        if (x1 - x0) > width * .55 or (y1 - y0) > height * .40:
            continue
        # 至少要像一個圖表，而不是單條底線。
        if x1 - x0 < 90 or y1 - y0 < 60:
            continue
        # 只留極小白邊；掃描卷題幹常緊貼圖表，安全邊界過大就會夾入文字。
        pad = 8
        candidate = (max(0, x0 - pad), max(0, y0 - pad), min(width, x1 + pad), min(height, y1 + pad))
        # 「尚有題目」等文字提示框通常被字填滿；真正圖表以線條、空白與圖像為主。
        if word_coverage(candidate, words) > .13:
            continue
        boxes.append(candidate)
    return merge_boxes(boxes, gap=18)


def merge_boxes(boxes: list[tuple[int, int, int, int]], gap: int) -> list[tuple[int, int, int, int]]:
    pending = boxes[:]; merged: list[tuple[int, int, int, int]] = []
    while pending:
        x0, y0, x1, y1 = pending.pop(0); changed = True
        while changed:
            changed = False
            for i, (a0, b0, a1, b1) in enumerate(pending):
                if not (a1 + gap < x0 or x1 + gap < a0 or b1 + gap < y0 or y1 + gap < b0):
                    x0, y0, x1, y1 = min(x0, a0), min(y0, b0), max(x1, a1), max(y1, b1)
                    pending.pop(i); changed = True; break
        merged.append((x0, y0, x1, y1))
    return merged


def word_coverage(box: tuple[int, int, int, int], words: list[dict]) -> float:
    """候選範圍被 OCR 文字覆蓋的比例；純文字提示框必須排除。"""
    x0, y0, x1, y1 = box
    covered = 0
    for word in words:
        ix0, iy0 = max(x0, word["x0"]), max(y0, word["y0"])
        ix1, iy1 = min(x1, word["x1"]), min(y1, word["y1"])
        if ix1 > ix0 and iy1 > iy0:
            covered += (ix1 - ix0) * (iy1 - iy0)
    return covered / max(1, (x1 - x0) * (y1 - y0))


def tighten_to_ink(image: Image.Image, box: tuple[int, int, int, int], words: list[dict], margin: int = 14) -> tuple[int, int, int, int]:
    """在候選格內找真正非文字墨跡的緊界，避免把圖周圍題幹帶進輸出。"""
    x0, y0, x1, y1 = box
    gray = np.asarray(image.convert("L")); local = gray[y0:y1, x0:x1] < 185
    local_words = []
    for word in words:
        if word["x1"] >= x0 and word["x0"] <= x1 and word["y1"] >= y0 and word["y0"] <= y1:
            local_words.append({"x0": word["x0"] - x0, "x1": word["x1"] - x0, "y0": word["y0"] - y0, "y1": word["y1"] - y0})
    ink = local & ~text_mask(local.shape, local_words, padding=5)
    ys, xs = np.where(ink)
    if not len(xs):
        return box
    return (max(0, x0 + int(xs.min()) - margin), max(0, y0 + int(ys.min()) - margin),
            min(image.width, x0 + int(xs.max()) + 1 + margin), min(image.height, y0 + int(ys.max()) + 1 + margin))


def owner_question(box: tuple[int, int, int, int], words: list[dict], page_height: int) -> int | None:
    anchors = []
    for word in words:
        match = QUESTION_RE.match(word["text"])
        if match and word["x0"] < 220:
            anchors.append((int(match.group(1)), word["y0"]))
    anchors.sort(key=lambda value: value[1])
    centre = (box[1] + box[3]) / 2
    for index, (number, top) in enumerate(anchors):
        bottom = anchors[index + 1][1] - 10 if index + 1 < len(anchors) else page_height
        if top - 12 <= centre < bottom:
            return number
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="保守裁切掃描考卷的圖表與表格。")
    parser.add_argument("pdf", type=Path, help="乾淨掃描 PDF")
    parser.add_argument("--output", "-o", type=Path, help="輸出資料夾")
    parser.add_argument("--dpi", type=int, default=250)
    parser.add_argument("--tile", type=int, default=32, help="視覺區塊偵測網格大小")
    parser.add_argument("--min-tiles", type=int, default=4, help="候選圖表最少網格數")
    args = parser.parse_args()
    pdf = args.pdf.expanduser().resolve()
    if pdf.suffix.lower() not in IMAGE_SUFFIXES or not pdf.exists():
        parser.error("請提供存在的 PDF 檔案")
    if shutil.which("pdftoppm") is None or shutil.which("tesseract") is None:
        parser.error("需要 pdftoppm 與 tesseract；請先安裝 Poppler 和 Tesseract")
    output = (args.output or pdf.with_name(safe_name(pdf.stem) + "_掃描圖表素材")).resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []; counts: dict[str, int] = {}
    with tempfile.TemporaryDirectory(prefix="exam-crop-") as temporary:
        pages = render_pages(pdf, args.dpi, Path(temporary))
        for page_no, page_path in enumerate(pages, start=1):
            with Image.open(page_path) as source:
                page = source.convert("RGB")
            words = ocr_words(page_path)
            for box in candidate_boxes(page, words, args.tile, args.min_tiles):
                crop_box = box
                if crop_box[2] - crop_box[0] < 70 or crop_box[3] - crop_box[1] < 70:
                    continue
                question = owner_question(crop_box, words, page.height)
                prefix = f"Q{question}" if question is not None else "Q未知"
                base = f"{prefix}_圖表_請人工確認"; counts[base] = counts.get(base, 0) + 1
                suffix = "" if counts[base] == 1 else f"_{counts[base]}"
                filename = base + suffix + ".png"
                page.crop(crop_box).save(output / filename)
                manifest.append({
                    "file": filename, "page": page_no, "kind": "圖表", "primary_question": question,
                    "shared_questions": [], "needs_review": True,
                    "review_reason": "掃描 PDF 自動定位：請確認沒有題幹／選項文字，並確認題號。",
                    "bbox_px": {"x0": crop_box[0], "top": crop_box[1], "x1": crop_box[2], "bottom": crop_box[3]},
                })
    (output / "manifest.json").write_text(json.dumps({"source_pdf": str(pdf), "dpi": args.dpi, "assets": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "README.txt").write_text("本工具只裁切原掃描頁面，不重繪、不補圖。\n所有候選均需人工確認；不確定題號會標 Q未知。\n", encoding="utf-8")
    archive = output.with_suffix(".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        for path in output.iterdir():
            if path.is_file():
                zipped.write(path, path.name)
    print(f"完成：{len(manifest)} 張候選素材\n資料夾：{output}\nZIP：{archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
