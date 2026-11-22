#!/usr/bin/env python3
"""唯讀掃描舊 questions 匯出檔，並產生品質關統計報告。"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from quality_gate import IMAGE_REFERENCE, NOUN_IMAGE_REFERENCE, check_paper, normalize, text


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    """Read an NDJSON snapshot without modifying the source file."""
    rows = []
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if line.strip():
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_number} 不是有效 JSON") from exc
                if not isinstance(row, dict):
                    raise ValueError(f"{path}:{line_number} 必須是 JSON 物件")
                rows.append(row)
    return rows


def read_image_ids(path: Path) -> set[str]:
    return {line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}


def exam_name(row: dict[str, Any]) -> str:
    return text(row.get("exam")).strip() or "（未命名考卷）"


def needs_image(question: str, passage: str, chart: Any) -> bool:
    """Use the gate's reference patterns plus old chart metadata as evidence."""
    body = normalize(question + "\n" + passage)
    chart_value = normalize(chart).strip()
    return bool(IMAGE_REFERENCE.search(body) or NOUN_IMAGE_REFERENCE.search(body) or
                (chart_value and chart_value != "無"))


def mapped_questions(rows: list[dict[str, Any]], image_ids: set[str]):
    """Return {exam: [(old row, quality-gate input, image-needed, has-image), ...]}."""
    passages: dict[str, dict[str, Any]] = {}
    for row in rows:
        if text(row.get("type")).strip() == "passage" and text(row.get("group_id")).strip():
            passages.setdefault(text(row["group_id"]).strip(), row)

    exams = defaultdict(list)
    for row in rows:
        if text(row.get("type")).strip() == "passage":
            continue
        group_id = text(row.get("group_id")).strip()
        passage_row = passages.get(group_id, {})
        passage = text(passage_row.get("q"))
        has_image = text(row.get("id")).strip() in image_ids or text(passage_row.get("id")).strip() in image_ids
        # Keep quality_gate.py unchanged.  It only needs a valid image type when an
        # image exists; missing-image evidence from legacy chart metadata is added below.
        gate_input = {
            "題號": row.get("no"), "答案": row.get("ans"), "題目": row.get("q"),
            "圖表類型": "圖" if has_image else "無", "題組文章": passage,
            "題組ID": group_id, "題型": row.get("type"), "詳解": row.get("sol"),
        }
        exams[exam_name(row)].append((row, gate_input, needs_image(text(row.get("q")), passage, row.get("chart")), has_image))
    return dict(exams)


def severity(flags: list[dict[str, str]]) -> str:
    return "block" if any(flag["severity"] == "block" for flag in flags) else "warn" if flags else "pass"


def scan(rows: list[dict[str, Any]], image_ids: set[str]) -> dict[str, Any]:
    """Scan rows in memory and return a JSON-serializable report."""
    exams_data = mapped_questions(rows, image_ids)
    exams_out, rule_counts = [], {"block": Counter(), "warn": Counter()}
    flagged_total = flagged_caught = 0
    for name in sorted(exams_data):
        members = exams_data[name]
        gate = check_paper(name, [item[1] for item in members])
        questions = []
        missing_count = block = warn = passed = 0
        for (old, _, image_needed, has_image), checked in zip(members, gate["questions"]):
            flags = list(checked["flags"])
            if image_needed and not has_image and not any(flag["rule"] == "missing_image" for flag in flags):
                flags.append({"severity": "block", "rule": "missing_image", "message": "題目或題組提及圖／表或標有圖表類型，但找不到圖片。"})
            item_severity = severity(flags)
            missing = any(flag["rule"] == "missing_image" for flag in flags)
            missing_count += missing
            block += item_severity == "block"; warn += item_severity == "warn"; passed += item_severity == "pass"
            for flag in flags:
                rule_counts[flag["severity"]][flag["rule"]] += 1
            reported = old.get("flag") is True or text(old.get("basis")).lstrip().startswith("[回報]")
            if reported:
                flagged_total += 1
                flagged_caught += bool(flags)
            questions.append({
                "id": old.get("id"), "exam": name, "number": old.get("no"), "severity": item_severity,
                "flags": flags, "has_image": has_image, "image_needed": image_needed,
            })
        exams_out.append({"exam": name, "summary": {"question_count": len(questions), "block": block, "warn": warn, "pass": passed, "missing_image": missing_count}, "paper_flags": gate["paper_flags"], "questions": questions})
    total = sum(exam["summary"]["question_count"] for exam in exams_out)
    complete = sum(not exam["paper_flags"] and exam["summary"]["block"] == exam["summary"]["warn"] == 0 for exam in exams_out)
    return {"version": "old-db scan v0.1", "total_questions": total, "exam_count": len(exams_out), "exams": exams_out,
            "rule_counts": {key: dict(sorted(value.items())) for key, value in rule_counts.items()},
            "fully_passing_exams": complete, "fully_passing_questions": sum(e["summary"]["pass"] for e in exams_out),
            "overlap_flag_report": {"caught": flagged_caught, "total": flagged_total}}


def sample_lines(report: dict[str, Any], rule: str) -> list[str]:
    result = []
    for exam in report["exams"]:
        for question in exam["questions"]:
            if any(flag["rule"] == rule for flag in question["flags"]):
                # q is intentionally not duplicated in JSON; use its stored mapping only for report via caller.
                result.append(question)
                if len(result) == 3: return result
    return result


def markdown_report(report: dict[str, Any], rows: list[dict[str, Any]]) -> str:
    text_by_id = {text(row.get("id")): text(row.get("q")).replace("\n", " ")[:60] for row in rows}
    all_exams = report["exams"]
    missing_ratios = sorted((e for e in all_exams if e["summary"]["question_count"] and e["summary"]["missing_image"] / e["summary"]["question_count"] > .30), key=lambda e: e["summary"]["missing_image"] / e["summary"]["question_count"], reverse=True)[:30]
    worst = sorted(all_exams, key=lambda e: (e["summary"]["pass"] / e["summary"]["question_count"] if e["summary"]["question_count"] else 1, e["exam"]))[:30]
    lines = ["# 舊題庫品質關掃描報告", "", "此報告僅讀取本機快照，未寫入資料庫。", "", "## 總覽", "", f"- 題目數：{report['total_questions']}", f"- 考卷數：{report['exam_count']}", f"- 完全通過題目數：{report['fully_passing_questions']}", f"- 完全通過考卷數：{report['fully_passing_exams']}", "", "## 各規則的題目數", ""]
    for level in ("block", "warn"):
        lines.append(f"### {level}"); lines.append("")
        for rule, count in report["rule_counts"][level].items(): lines.append(f"- `{rule}`：{count}")
        if not report["rule_counts"][level]: lines.append("- 無")
        lines.append("")
    lines += ["## Overlap with flag/[回報]", "", f"- 品質關亦抓到：{report['overlap_flag_report']['caught']}/{report['overlap_flag_report']['total']}", "", "## 缺圖比例超過 30% 的考卷（最多 30 份）", ""]
    lines += [f"- {e['exam']}：{e['summary']['missing_image']}/{e['summary']['question_count']}（{e['summary']['missing_image']/e['summary']['question_count']:.1%}）" for e in missing_ratios] or ["- 無"]
    lines += ["", "## 通過率最低的 30 份考卷", ""]
    lines += [f"- {e['exam']}：{e['summary']['pass']}/{e['summary']['question_count']}（{e['summary']['pass']/e['summary']['question_count']:.1%}）" for e in worst] or ["- 無"]
    lines += ["", "## 各規則樣本（最多 3 題）", ""]
    for level in ("block", "warn"):
        for rule in report["rule_counts"][level]:
            lines += [f"### `{rule}`", ""]
            for question in sample_lines(report, rule): lines.append(f"- id={question['id']}；考卷={question['exam']}；題號={question['number']}；題幹={text_by_id.get(text(question['id']), '')}")
            lines.append("")
    lines += ["## 已知限制", "", "- `_img.txt` 只能證明題目 ID 有圖片，無法判斷圖片是否完整、清晰或與題幹相符。", "- 以題幹關鍵字與舊 `chart` 欄位推定需要圖片；文字提到圖但其實不需附圖會誤報，漏掉未用關鍵字且 `chart` 為「無」的圖片需求會漏報。", "- 題組文章以相同 `group_id` 的 `passage` 列回填；錯誤或遺漏的 group_id 會造成錯誤的題組／圖片關聯。", "- 品質關是規則式文字檢查，不能驗證答案正確性、OCR 數字是否忠實、重複題或與原卷答案的衝突。", "- 考卷層級題號與題組文章問題列在 JSON 的 `paper_flags`，不計入逐題規則數。", ""]
    return "\n".join(lines)


def write_csv(report: dict[str, Any], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output); writer.writerow(["exam", "question count", "block", "warn", "pass", "missing-image count"])
        for exam in report["exams"]:
            s = exam["summary"]; writer.writerow([exam["exam"], s["question_count"], s["block"], s["warn"], s["pass"], s["missing_image"]])


def main() -> int:
    parser = argparse.ArgumentParser(description="唯讀掃描舊題庫快照")
    parser.add_argument("--input", type=Path, default=Path("_work/old_q.ndjson")); parser.add_argument("--images", type=Path, default=Path("_work/_img.txt")); parser.add_argument("--output-dir", type=Path, default=Path("_work"))
    args = parser.parse_args(); rows = read_ndjson(args.input); report = scan(rows, read_image_ids(args.images)); args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "scan_old_db.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "scan_old_db.md").write_text(markdown_report(report, rows), encoding="utf-8")
    write_csv(report, args.output_dir / "scan_old_db_by_exam.csv")
    return 0


if __name__ == "__main__": raise SystemExit(main())
