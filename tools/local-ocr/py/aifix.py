"""OCR 後 AI 校對（選用）：請 Gemini（agy）只列出「原文片段 → 修正片段」，程式只套用安全的修改。

安全條件：原文片段必須在文中恰好出現一次；兩邊差異不超過 2 個字；不得動到題號與選項標記。
用法：python aifix.py in.txt [out.txt]   → 印出套用／略過的清單，out 預設覆寫 in.txt.fixed
不加 --dangerously-skip-permissions，Gemini 只回文字。"""
import difflib
import re
import subprocess
import sys

PROMPT = ("以下是國中考卷的 OCR 結果，含辨識錯字（例如：人/入、牛/生、勺/ㄅ、久/ㄆ、Z/乙、手寫雜訊字）。"
          "請只修正明顯的 OCR 錯字，不要改寫、不要增刪題目、不要改題號與選項格式、不確定就不要改。"
          "輸出格式：只列出你修改的地方，每行一筆「原文片段 → 修正片段」，最多 60 行，不要其他說明。不要使用任何工具。\n內容：\n")


def ask(text):
    r = subprocess.run(["agy", "-p", PROMPT + text], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=600)
    return r.stdout


def safe(a, b, text):
    if not a or a == b or text.count(a) != 1:
        return False
    if re.search(r"[\(（][A-E][\)）]|^\s*\d+\s*[\.、]", a) and re.sub(r"\W", "", a)[:1] != re.sub(r"\W", "", b)[:1]:
        return False
    d = sum(1 for t, *_ in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if t != "equal")
    changed = sum(max(i2 - i1, j2 - j1) for t, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if t != "equal")
    return changed <= 2


def apply(text, reply):
    ok, skip = [], []
    for ln in reply.splitlines():
        m = re.match(r"\s*(.+?)\s*(?:→|->)\s*(.+?)\s*$", ln)
        if not m:
            continue
        a, b = m.groups()
        if safe(a, b, text):
            text = text.replace(a, b)
            ok.append((a, b))
        else:
            skip.append((a, b))
    return text, ok, skip


if __name__ == "__main__":
    src = open(sys.argv[1], encoding="utf-8").read()
    new, ok, skip = apply(src, ask(src))
    open(sys.argv[2] if len(sys.argv) > 2 else sys.argv[1] + ".fixed", "w", encoding="utf-8").write(new)
    print(f"套用 {len(ok)}、略過 {len(skip)}")
    for a, b in ok:
        print("  ✔", a, "→", b)
    for a, b in skip:
        print("  ✘", a, "→", b)
