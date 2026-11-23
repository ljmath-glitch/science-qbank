#!/usr/bin/env python3
"""題庫匯入 JSON 的純規則品質關 v0.1。"""
from __future__ import annotations
import argparse, json, re, unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

IMAGE_REFERENCE = re.compile(r"附圖|如圖|下圖|右圖|左圖|上圖|附表|如下表|表\s*[一二三四五六七八九十0-9]+|如表|見圖|圖\s*[（(]?[一二三四五六七八九十0-9A-Za-z]+[）)]?|示意圖|如[右左上下]圖")
NOUN_IMAGE_REFERENCE = re.compile(r"電路圖|流程圖|長條圖|圓餅圖")
# Do not use \b here: it does not see a boundary between CJK text and A.
OPTION_MARKER = re.compile(r"(?:\(([A-E])\)|(?<![A-Za-z0-9])([A-E])\s*[\.．、])")
PAGE_NUMBER_LINE = re.compile(r"^\s*-\s*\d+\s*-\s*$", re.M)
PAGE_LABEL_EDGE = re.compile(r"(?:^|\n)\s*\(\s*\d+\s*-\s*\d+\s*\)(?=\s|$)|(?:^|\s)\(\s*\d+\s*-\s*\d+\s*\)\s*(?:$|\n)", re.M)
TRAILING_FIGURES = re.compile(r"圖[一二三四五六七八九十]+(?:圖[一二三四五六七八九十]+)+\s*[。．]?$")
# A plain product such as 2×1000 has zeroes immediately after 10.  A flattened
# exponent has consecutive, non-zero-leading digits immediately after 10 (3×1020).
FLATTENED_POWER = re.compile(r"(?:\\times|×|x)\s*10[1-9]\d+", re.I)
FLATTENED_UNIT = re.compile(r"(?<![A-Za-z0-9])(?:cm|m)(?:2|3)(?!\d)|m\s*/\s*s\s*2(?!\d)", re.I)
GARBLED_TEXT = re.compile(r"[\ufffd\ue000-\uf8ff]")
ISOLATED_SYMBOL = re.compile(r"(?<![A-Za-z0-9])[@#](?![A-Za-z0-9])")   # $ 是 LaTeX 界線、~ 是範圍符號，不算
REPEATED_PUNCTUATION = re.compile(r"[!?！？]{2,}|[,，;；:：]{2,}|[。．]{2,}")
LATEX_OPTION = re.compile(r"\\mathrm\s*\{\s*\([A-EＡ-Ｅ]\)")
CHEMICAL_SUBSCRIPT = re.compile(r"(?<![A-Za-z0-9])(?:MnO2|H2O|CO2|SO4)(?![A-Za-z0-9])", re.I)
VARIABLE_SUBSCRIPT = re.compile(r"(?<![A-Za-z0-9])(?:I|R|V|Q|x|y|z)\d+(?![A-Za-z0-9])")
QUESTION_NUMBER = re.compile(r"^[1-9]\d*$")
NOISE_END = re.compile(r"試題結束|本卷結束|背面尚有試題|請翻頁|第\s*\d+\s*頁")
VALID_IMAGE_TYPES = {"圖", "表", "圖表", "圖片", "照片", "示意圖", "流程圖", "電路圖", "實驗圖", "無"}
TRUEFALSE_TRUE_OPTIONS = {"正確", "是", "對", "O", "T", "TRUE", "YES"}
TRUEFALSE_FALSE_OPTIONS = {"錯誤", "否", "錯", "X", "F", "FALSE", "NO"}

def text(value: Any) -> str: return "" if value is None else str(value)
def normalize(value: Any) -> str: return unicodedata.normalize("NFKC", text(value)).translate(str.maketrans("（）［］", "()[]"))
def normalized_answer(value: Any) -> str: return re.sub(r"[\s,，、()（）.．]", "", normalize(value)).upper().translate(str.maketrans("○✕×", "OXX"))
def add_flag(flags, severity, rule, message): flags.append({"severity": severity, "rule": rule, "message": message})

def option_parts(question: str) -> dict[str, str]:
    """從題尾選出 A 起算、連續遞增的選項列。"""
    source, matches = normalize(question), list(OPTION_MARKER.finditer(normalize(question)))
    best = []
    for start, match in enumerate(matches):
        label = (match.group(1) or match.group(2)).upper()
        if label != "A": continue
        run, expected = [(match, label)], ord("B")
        for later in matches[start + 1:]:
            next_label = (later.group(1) or later.group(2)).upper()
            if ord(next_label) == expected: run.append((later, next_label)); expected += 1
            elif next_label == "A": break
        # 反向偏好最後一段同長序列：題尾的完整選項列勝過題幹中的 (A)。
        if len(run) >= 2 and len(run) >= len(best): best = run
    return {label: source[match.end():(best[i + 1][0].start() if i + 1 < len(best) else len(source))].strip() for i, (match, label) in enumerate(best)}

def option_semantic(value: Any) -> str:
    """正規化是非選項的短文字，不將一般二選一誤認為是非題。"""
    return re.sub(r"[\s,，、.．:：;；()\[\]{}「」『』]", "", normalize(value)).upper().translate(str.maketrans("○✕×", "OXX"))

def has_truefalse_options(parts: dict[str, str]) -> bool:
    """只有剛好 A、B 且一真一假語義時，才推定空題型欄位為是非題。"""
    if set(parts) != {"A", "B"}: return False
    semantics = {option_semantic(parts["A"]), option_semantic(parts["B"])}
    return bool(semantics & TRUEFALSE_TRUE_OPTIONS) and bool(semantics & TRUEFALSE_FALSE_OPTIONS)

def question_kind(question, parts):
    kind = normalize(question.get("題型")).lower()
    if any(w in kind for w in ("填充", "計算", "非選", "問答", "簡答", "作答")): return "nonchoice"
    if any(w in kind for w in ("是非", "判斷")): return "truefalse"
    if any(w in kind for w in ("複選", "多選")): return "multiple"
    if not kind.strip() and has_truefalse_options(parts): return "truefalse"
    if any(w in kind for w in ("選擇", "單選")) or parts: return "choice"
    return "nonchoice"

def check_notation(value, field):
    """題幹、題組文章、詳解共用檢查。"""
    # NFKC 會把 Unicode 上／下標（例如 ²、⁻、₉）轉成一般數字；
    # 壓平偵測必須看原文，避免把已正確排版的記號誤判為遺失上／下標。
    flags, raw, body = [], text(value), normalize(value)
    if NOISE_END.search(body): add_flag(flags, "warn", "exam_end_noise", f"{field}含考卷版面雜訊。")
    if PAGE_NUMBER_LINE.search(body): add_flag(flags, "warn", "page_number_noise", f"{field}含獨立頁碼樣式。")
    if PAGE_LABEL_EDGE.search(body): add_flag(flags, "warn", "page_label_noise", f"{field}含行首或行尾頁面標籤。")
    if TRAILING_FIGURES.search(body): add_flag(flags, "warn", "trailing_figure_labels", f"{field}題末有連黏圖號。")
    if FLATTENED_POWER.search(raw): add_flag(flags, "warn", "flattened_exponent", f"{field}疑似次方壓平。")
    if FLATTENED_UNIT.search(raw): add_flag(flags, "warn", "flattened_square_unit", f"{field}疑似單位上標遺失。")
    if CHEMICAL_SUBSCRIPT.search(raw) or VARIABLE_SUBSCRIPT.search(raw): add_flag(flags, "warn", "flattened_subscript", f"{field}疑似化學式或變數下標壓平。")
    if GARBLED_TEXT.search(raw): add_flag(flags, "warn", "garbled_text", f"{field}含無法辨識的亂碼。")
    if ISOLATED_SYMBOL.search(raw): add_flag(flags, "warn", "isolated_symbol", f"{field}含孤立符號。")
    if REPEATED_PUNCTUATION.search(raw): add_flag(flags, "warn", "repeated_punctuation", f"{field}含重複標點。")
    return flags

def is_passage(question):
    return "passage" in normalize(question.get("題型")).lower()

def compact(value):
    return re.sub(r"\s+", "", normalize(value))

def passage_flags(question):
    if is_passage(question): return []
    body, article = compact(question.get("題目")), compact(question.get("題組文章"))
    flags = []
    if article and len(article) >= 40 and article in body:
        add_flag(flags, "warn", "passage_content_in_stem", "一般題題幹重複包含題組文章。")
    return flags

def image_flags(question):
    flags=[]; body, image_type = normalize(question.get("題目")), normalize(question.get("圖表類型")).strip()
    ref, noun, bad = bool(IMAGE_REFERENCE.search(body)), bool(NOUN_IMAGE_REFERENCE.search(body)), image_type not in VALID_IMAGE_TYPES or image_type == "無"
    if ref and bad: add_flag(flags, "block", "missing_image", "題目提及圖／表，但圖表類型為空、無或非法值。")
    elif noun and bad: add_flag(flags, "warn", "possible_missing_image", "題目僅出現圖表名詞，可能需附圖。")
    return flags

def check_question(question):
    flags = image_flags(question); body, answer = text(question.get("題目")), normalized_answer(question.get("答案")); parts=option_parts(body); kind=question_kind(question, parts)
    if kind in {"choice", "multiple", "truefalse"}:
        allowed = "OXTFAB" if kind == "truefalse" else "".join(parts) or "ABCDE"
        if kind != "truefalse":
            expected = "ABCDE" if "E" in parts else "ABCD"
            if not parts or any(not parts.get(label, "").strip() for label in expected): add_flag(flags,"block","incomplete_options","選項缺少或內容為空。")
        if not answer: add_flag(flags,"block","missing_answer","答案為空。")
        elif any(label not in allowed for label in answer) or (kind != "multiple" and len(answer)!=1): add_flag(flags,"block","answer_out_of_range",f"答案「{answer}」不在選項範圍 {allowed}。")
    elif not answer: add_flag(flags,"block","missing_answer","答案為空。")
    for field in ("題目","題組文章","詳解"): flags.extend(check_notation(question.get(field),field))
    flags.extend(passage_flags(question))
    if LATEX_OPTION.search(body): add_flag(flags,"warn","latex_option_label","LaTeX 的 \\mathrm 內含選項標號。")
    return flags

def question_number(value):
    raw=text(value).strip(); return int(raw) if QUESTION_NUMBER.fullmatch(raw) else None

def check_numbering(questions):
    """題號問題歸到考卷，而非任何一題。"""
    flags=[]; sections=[[]]
    for index,q in enumerate(questions):
        number=question_number(q.get("題號"))
        if number is None: add_flag(flags,"block","invalid_question_number",f"第 {index+1} 筆題號不是正整數。"); continue
        if sections[-1] and number==1 and (normalize(q.get("大題")).strip() or sections[-1][-1][1]>1): sections.append([])
        sections[-1].append((index,number))
    for section in sections:
        if not section: continue
        values=[n for _,n in section]
        if values[0]!=1: add_flag(flags,"block","missing_first_question_number",f"此大題從 {values[0]} 開始，缺第 1 題。")
        seen=set()
        for n in values:
            if n in seen: add_flag(flags,"block","duplicate_question_number",f"題號 {n} 重複。")
            seen.add(n)
        for before,after in zip(values,values[1:]):
            if after<before: add_flag(flags,"warn","out_of_order_question_number",f"題號由 {before} 倒退為 {after}，可能是大題重編號。")
        for n in range(1,max(values)+1):
            if n not in seen: add_flag(flags,"block","missing_question_number",f"題號缺 {n}。")
    return flags

def check_group_articles(questions):
    groups=defaultdict(list)
    for q in questions:
        if text(q.get("題組ID")).strip(): groups[text(q["題組ID"]).strip()].append(q)
    return [{"severity":"block","rule":"missing_group_article","message":f"題組 {gid} 的所有子題皆無題組文章。"} for gid,members in groups.items() if not any(text(q.get("題組文章")).strip() for q in members)]

def check_paper(name, questions):
    paper_flags=check_numbering(questions)+check_group_articles(questions); counts=Counter(f["rule"] for f in paper_flags); entries=[]; block=warn=passed=0
    passage_articles = [compact(q.get("題組文章") or q.get("題目")) for q in questions if is_passage(q)]
    for q in questions:
        flags=check_question(q); counts.update(f["rule"] for f in flags); severity="block" if any(f["severity"]=="block" for f in flags) else "warn" if flags else "pass"
        if not is_passage(q):
            body = compact(q.get("題目"))
            if any(len(article) >= 40 and article in body for article in passage_articles) and not any(f["rule"] == "passage_content_in_stem" for f in flags):
                add_flag(flags, "warn", "passage_content_in_stem", "一般題題幹重複包含題組文章。")
                counts.update(["passage_content_in_stem"]); severity="warn" if severity == "pass" else severity
        block += severity=="block"; warn += severity=="warn"; passed += severity=="pass"; entries.append({"題號":q.get("題號"),"flags":flags,"severity":severity})
    return {"考卷名":name,"summary":{"題數":len(questions),"通過數":passed,"block數":block,"warn數":warn,"依規則統計":dict(sorted(counts.items()))},"paper_flags":paper_flags,"questions":entries}

def check_data(data): return {"version":"品質關 v0.1","papers":[check_paper(name,qs) for name,qs in data.items()]}
def markdown_report(report):
    lines=["# 題目品質關 v0.1 報告","","純規則檢查；`block` 表示不可啟用，`warn` 表示需人看。",""]
    for paper in report["papers"]:
        s=paper["summary"]; lines += ["## "+paper["考卷名"],"",f"- 題數：{s['題數']}；通過：{s['通過數']}；block：{s['block數']}；warn：{s['warn數']}","- 考卷層級："+("；".join(f"`{f['rule']}`：{f['message']}" for f in paper["paper_flags"]) or "無"),""]
    return "\n".join(lines)

def main():
    p=argparse.ArgumentParser(description="題庫 JSON 品質關 v0.1（純規則）"); p.add_argument("input",type=Path); p.add_argument("--json-output",type=Path,default=Path("quality_gate_report.json")); p.add_argument("--markdown-output",type=Path,default=Path("quality_gate_report.md")); args=p.parse_args()
    data=json.loads(args.input.read_text(encoding="utf-8"));
    if not isinstance(data,dict) or not all(isinstance(v,list) for v in data.values()): raise ValueError("輸入格式必須是 {考卷名: [題目, ...]}。")
    report=check_data(data); args.json_output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); args.markdown_output.write_text(markdown_report(report),encoding="utf-8"); return 0
if __name__=="__main__": raise SystemExit(main())
