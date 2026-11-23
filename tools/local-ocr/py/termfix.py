"""OCR 字形近似錯字修正：用題庫既有題文的 3 字詞庫（models/termfix_c3.json）。

只改「中間字」：該字與前後字組成的 3 字詞庫裡從沒出現過，而換成字形近似的字（人↔入、牛↔生…）
後在詞庫出現次數 >= MIN_COUNT 才改。字串邊緣、非近似字一律不動，寧可漏改、不亂改。
TERMFIX=0 可關閉。詞庫缺檔時什麼都不做。"""
import json
import os
import re

MIN_COUNT = int(os.environ.get("TERMFIX_MIN", "8"))
# 字形相近、OCR 實測會互讀的字（雙向）。只列高把握的，避免把正確字改壞
_PAIRS = ["人入", "牛生", "未末", "土士", "千干", "大太", "辦瓣", "戊戌", "日曰", "刀力", "祖袓", "俱具", "象像"]
_CONF = {}
for _p in _PAIRS:
    for _a, _b in (_p, _p[::-1]):
        _CONF.setdefault(_a, []).append(_b)
_C3 = None
_RUN = re.compile(r"[一-鿿]{3,}")
_RUN2 = re.compile(r"(?<![一-鿿])[一-鿿]{2}(?![一-鿿])")  # 被標點隔開、只剩 2 字的詞（牛頓）
_C2 = None
MIN_COUNT2 = int(os.environ.get("TERMFIX_MIN2", "20"))


def _bigrams(c3):
    global _C2
    if _C2 is None:
        _C2 = {}
        for k, v in c3.items():
            _C2[k[:2]] = _C2.get(k[:2], 0) + v
    return _C2


def _load():
    global _C3
    if _C3 is None:
        path = os.path.join(os.environ.get("OCR_MODELS_DIR") or "", "..", "termfix_c3.json")
        for p in (path, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "termfix_c3.json"),
                  os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "models", "termfix_c3.json")):
            if os.path.isfile(p):
                _C3 = json.load(open(p, encoding="utf-8"))
                break
        else:
            _C3 = {}
    return _C3


# 注音符號被讀成字形相近的漢字：勺→ㄅ、久→ㄆ（只在「由／至／從／為＋符號＋運…」這類標籤位置才改）
_RE_ZY = [(re.compile(r"(?<=[由至從為在])勺"), "ㄅ"), (re.compile(r"(?<=[由至從為在])久(?=[運送區段圖中端部])"), "ㄆ"),
          (re.compile(r"(?<![一-鿿])勺(?![一-鿿])"), "ㄅ")]


_PHRASES = None


def _phrases():
    """整詞修正表（phrase_fixes.json）：人工確認過、不可能是正確寫法的錯詞。缺檔時什麼都不做。"""
    global _PHRASES
    if _PHRASES is None:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "phrase_fixes.json")
        try:
            _PHRASES = [(x["wrong"], x["right"]) for x in json.load(open(p, encoding="utf-8")).get("fixes", [])
                        if x.get("wrong") and x.get("right") and x["wrong"] != x["right"]]
        except (OSError, ValueError, KeyError):
            _PHRASES = []
    return _PHRASES


def fix_text(text):
    if os.environ.get("TERMFIX", "1") == "0":
        return text
    for wrong, right in _phrases():
        text = text.replace(wrong, right)
    text = text.replace("辦瓣", "瓣")
    for rx, to in _RE_ZY:
        text = rx.sub(to, text)
    c3 = _load()
    if not c3:
        return text

    def rep(m):
        r = list(m.group(0))
        L = len(r)
        for i in range(L):
            # 含該字的所有 3 字視窗（首、中、尾）；原字在任一視窗出現過就不動
            wins = [(j, i - j) for j in range(max(0, i - 2), min(i, L - 3) + 1)]
            tri = lambda c: [r[j:i] + [c] + r[i + 1:j + 3] for j, _ in wins]
            if any(c3.get("".join(w), 0) > 0 for w in tri(r[i])):
                continue
            best = None
            for c in _CONF.get(r[i], ()):
                n = max((c3.get("".join(w), 0) for w in tri(c)), default=0)
                if n >= MIN_COUNT and (best is None or n > best[0]):
                    best = (n, c)
            if best:
                r[i] = best[1]
        return "".join(r)
    text = _RUN.sub(rep, text)
    c2 = _bigrams(c3)

    def rep2(m):
        w = m.group(0)
        if c2.get(w, 0) > 0:
            return w
        best = None
        for i in (0, 1):
            for c in _CONF.get(w[i], ()):
                cand = w[:i] + c + w[i + 1:]
                n = c2.get(cand, 0)
                if n >= MIN_COUNT2 and (best is None or n > best[0]):
                    best = (n, cand)
        return best[1] if best else w
    return _RUN2.sub(rep2, text)
