#!/usr/bin/env python3
"""題庫匯入 JSON 的純規則品質關 v0。"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


IMAGE_REFERENCE = re.compile(
    r"附圖|如圖|下圖|右圖|左圖|上圖|附表|如下表|電路圖|圖\s*[一二三四五六七八九十0-9A-Za-z]\s*所示|如[右左上下]所示"
)
OPTION_MARKER = re.compile(r"\(([A-DＡ-Ｄ])\)")
PAGE_NUMBER = re.compile(r"-\s*\d+\s*-")
PAGE_LABEL = re.compile(r"[（(]\s*\d+\s*-\s*\d+\s*[）)]")
TRAILING_FIGURES = re.compile(r"圖[一二三四五六七八九十]+(?:圖[一二三四五六七八九十]+)+\s*[。．]?$" )
FLATTENED_POWER = re.compile(r"(?:\\times|×|x)\s*10(?:\$\s*[+-]?\s*\d+|\d{2,})")
FLATTENED_UNIT = re.compile(r"(?<![A-Za-z])(?:cm|m)\s*2\b", re.IGNORECASE)
LATEX_OPTION = re.compile(r"\\mathrm\s*\{\s*\([A-DＡ-Ｄ]\)")
FLATTENED_SUBSCRIPT = re.compile(r"\b[A-Za-z]\d+\b")


def text(value: Any) -> str:
    """將空值安全地轉成可檢查字串。"""
    return "" if value is None else str(value)


def add_flag(flags: list[dict[str, str]], severity: str, rule: str, message: str) -> None:
    flags.append({"severity": severity, "rule": rule, "message": message})


def option_parts(question: str) -> dict[str, str]:
    """取出 (A) 到 (D) 的內容；重複標號保留第一個。"""
    matches = list(OPTION_MARKER.finditer(question))
    parts: dict[str, str] = {}
    for index, match in enumerate(matches):
        label = match.group(1).upper().translate(str.maketrans("ＡＢＣＤ", "ABCD"))
        if label not in parts:
            parts[label] = question[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(question)].strip()
    return parts


def expected_options(question: str, answer: str, parts: dict[str, str]) -> list[str]:
    """以現有標號與答案判定四選一或是非題，保守地預設四選一。"""
    if "C" in parts or "D" in parts or answer.upper() in {"C", "D"}:
        return list("ABCD")
    normalized = {key: re.sub(r"[。．\s]", "", value) for key, value in parts.items()}
    if set(parts) == {"A", "B"} and {normalized["A"], normalized["B"]} <= {"正確", "錯誤", "是", "否", "對", "錯"}:
        return list("AB")
    return list("ABCD")


def check_question(question: dict[str, Any]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    body = text(question.get("題目"))
    group_article = text(question.get("題組文章"))
    image_type = text(question.get("圖表類型")).strip()

    # 題組文章亦可能是題幹的一部分，故一併偵測圖表指涉。
    if IMAGE_REFERENCE.search(body + "\n" + group_article) and image_type in {"", "無"}:
        add_flag(flags, "block", "missing_image", "題目或題組文章提及圖／表，但圖表類型為空或「無」。")

    parts = option_parts(body)
    answer = text(question.get("答案")).strip().upper()
    required = expected_options(body, answer, parts)
    missing = [label for label in required if not parts.get(label, "").strip()]
    if missing:
        add_flag(flags, "block", "incomplete_options", "選項缺少或內容為空：" + ", ".join(missing) + "。")
    if not answer:
        add_flag(flags, "block", "missing_answer", "答案為空。")
    elif answer not in required:
        add_flag(flags, "block", "answer_out_of_range", "答案「%s」不在選項範圍 %s。" % (answer, "/".join(required)))

    if text(question.get("題組ID")).strip() and not group_article.strip():
        add_flag(flags, "block", "missing_group_article", "有題組ID，但本子題沒有題組文章。")

    if "試題結束" in body:
        add_flag(flags, "warn", "exam_end_noise", "題目含「試題結束」版面雜訊。")
    if PAGE_NUMBER.search(body):
        add_flag(flags, "warn", "page_number_noise", "題目含頁碼樣式（例如 - 1 -）。")
    if PAGE_LABEL.search(body):
        add_flag(flags, "warn", "page_label_noise", "題目含頁面標籤樣式（例如 (7-2)）。")
    if TRAILING_FIGURES.search(body):
        add_flag(flags, "warn", "trailing_figure_labels", "題末有連黏圖號（例如 圖一圖二圖三）。")
    if FLATTENED_POWER.search(body):
        add_flag(flags, "warn", "flattened_exponent", "疑似次方壓平（例如 3×1020 或 10$-19）。")
    if FLATTENED_UNIT.search(body):
        add_flag(flags, "warn", "flattened_square_unit", "疑似面積單位上標遺失（例如 cm2、m2）。")
    if FLATTENED_SUBSCRIPT.search(body):
        add_flag(flags, "warn", "flattened_subscript", "英文字母後接數字，疑似下標壓平。")
    if LATEX_OPTION.search(body):
        add_flag(flags, "warn", "latex_option_label", "LaTeX 的 \\mathrm 內含選項標號。")
    return flags


def question_number(value: Any) -> int | None:
    found = re.search(r"\d+", text(value))
    return int(found.group()) if found else None


def check_numbering(questions: list[dict[str, Any]]) -> dict[int, list[dict[str, str]]]:
    """回傳以題目索引對應的題號問題；無法解析題號亦屬 block。"""
    result: dict[int, list[dict[str, str]]] = {}
    seen: dict[int, int] = {}
    numbers: list[tuple[int, int]] = []
    for index, question in enumerate(questions):
        number = question_number(question.get("題號"))
        if number is None:
            result.setdefault(index, []).append({"severity": "block", "rule": "invalid_question_number", "message": "題號無法解析為正整數。"})
        else:
            numbers.append((index, number))
            if number in seen:
                for affected in (seen[number], index):
                    result.setdefault(affected, []).append({"severity": "block", "rule": "duplicate_question_number", "message": "題號 %d 重複。" % number})
            else:
                seen[number] = index
    if numbers:
        values = sorted(seen)
        for expected in range(values[0], values[-1] + 1):
            if expected not in seen:
                # 缺號沒有對應題目，附到最接近前一題以保留在逐題清單中。
                prior = max((pair for pair in numbers if pair[1] < expected), default=numbers[0], key=lambda pair: pair[1])[0]
                result.setdefault(prior, []).append({"severity": "block", "rule": "missing_question_number", "message": "題號缺 %d。" % expected})
    return result


def check_paper(name: str, questions: list[dict[str, Any]]) -> dict[str, Any]:
    numbering = check_numbering(questions)
    entries = []
    counts: Counter[str] = Counter()
    block_count = warn_count = passed = 0
    for index, question in enumerate(questions):
        flags = check_question(question) + numbering.get(index, [])
        for flag in flags:
            counts[flag["rule"]] += 1
        if any(flag["severity"] == "block" for flag in flags):
            block_count += 1
        elif any(flag["severity"] == "warn" for flag in flags):
            warn_count += 1
        else:
            passed += 1
        entries.append({"題號": question.get("題號"), "flags": flags, "severity": "block" if any(f["severity"] == "block" for f in flags) else "warn" if flags else "pass"})
    return {"考卷名": name, "summary": {"題數": len(questions), "通過數": passed, "block數": block_count, "warn數": warn_count, "依規則統計": dict(sorted(counts.items()))}, "questions": entries}


def check_data(data: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    papers = [check_paper(name, questions) for name, questions in data.items()]
    return {"version": "品質關 v0", "papers": papers}


def markdown_report(report: dict[str, Any]) -> str:
    lines = ["# 題目品質關 v0 報告", "", "純規則檢查；`block` 表示不可啟用，`warn` 表示需人看。", ""]
    for paper in report["papers"]:
        summary = paper["summary"]
        lines += ["## " + paper["考卷名"], "", "- 題數：%d；通過：%d；block：%d；warn：%d" % (summary["題數"], summary["通過數"], summary["block數"], summary["warn數"]), "- 依規則統計：" + ("、".join("%s %d" % item for item in summary["依規則統計"].items()) or "無"), "", "| 題號 | 嚴重度 | flags |", "| --- | --- | --- |"]
        for entry in paper["questions"]:
            flag_text = "<br>".join("`%s`：%s" % (flag["rule"], flag["message"]) for flag in entry["flags"]) or "—"
            lines.append("| %s | %s | %s |" % (entry["題號"], entry["severity"], flag_text))
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="題庫 JSON 品質關 v0（純規則）")
    parser.add_argument("input", type=Path, help="輸入 JSON")
    parser.add_argument("--json-output", type=Path, default=Path("quality_gate_report.json"))
    parser.add_argument("--markdown-output", type=Path, default=Path("quality_gate_report.md"))
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not all(isinstance(value, list) for value in data.values()):
        raise ValueError("輸入格式必須是 {考卷名: [題目, ...]}。")
    report = check_data(data)
    args.json_output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.markdown_output.write_text(markdown_report(report), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
