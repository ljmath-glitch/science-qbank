#!/bin/sh
# Copy only committed, public source.  Never reads the working tree of SOURCE.
set -eu
SOURCE='/Users/chiafuchang/vibe-coding/Codex/OCR＋answer key/exam-answer-key-formatter'
DEST="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/py"
mkdir -p "$DEST/figcrop" "$DEST/dehand" "$DEST/exam-to-word/scripts" "$DEST/exam-to-word/assets"
copy() { git -C "$SOURCE" show "origin/main:$1" > "$DEST/$2"; }
copy ocr/pyexam.py pyexam.py
copy ocr/ppocr_engine.py ppocr_engine.py
copy ocr/to_qbank_xlsx.py to_qbank_xlsx.py
copy ocr/to_zizi_word.py to_zizi_word.py
copy ocr/qbank_latex.py qbank_latex.py
copy ocr/figcrop/crop.py figcrop/crop.py
copy ocr/figcrop/refine.py figcrop/refine.py
copy ocr/dehand/__init__.py dehand/__init__.py
copy ocr/dehand/apply.py dehand/apply.py
copy exam-to-word/scripts/buildlib.py exam-to-word/scripts/buildlib.py
copy exam-to-word/assets/template.docx exam-to-word/assets/template.docx
echo "Synced committed origin/main sources to $DEST"
