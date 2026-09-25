"""Keep the ABK page furniture while rebuilding its repeatable exam body.

The source template already contains the approved B4 header, watermark, and
numbering definition (numId 100). Only word/document.xml is changed here.
"""

from copy import deepcopy
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from lxml import etree


TEMPLATE = Path(__file__).resolve().parents[1] / "templates" / "abk_tpl.docx"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def tag(name):
    return f"{{{W}}}{name}"


def set_question_properties(paragraph):
    old = paragraph.find("w:pPr", NS)
    if old is not None:
        paragraph.remove(old)
    props = etree.Element(tag("pPr"))
    etree.SubElement(props, tag("pStyle"), {tag("val"): "ListParagraph"})
    etree.SubElement(props, tag("widowControl"))
    numbering = etree.SubElement(props, tag("numPr"))
    etree.SubElement(numbering, tag("ilvl"), {tag("val"): "0"})
    etree.SubElement(numbering, tag("numId"), {tag("val"): "100"})
    tabs = etree.SubElement(props, tag("tabs"))
    for position in (0, 709, 1985, 3260, 4536):
        etree.SubElement(tabs, tag("tab"), {tag("val"): "left", tag("pos"): str(position)})
    etree.SubElement(props, tag("snapToGrid"), {tag("val"): "0"})
    etree.SubElement(props, tag("spacing"), {tag("after"): "120"})
    etree.SubElement(props, tag("ind"), {tag("left"): "567", tag("hanging"): "425"})
    run_props = etree.SubElement(props, tag("rPr"))
    etree.SubElement(
        run_props,
        tag("rFonts"),
        {tag("ascii"): "Times New Roman", tag("hAnsi"): "Times New Roman", tag("eastAsia"): "DFPYuanMedium-B5"},
    )
    etree.SubElement(run_props, tag("sz"), {tag("val"): "20"})
    etree.SubElement(run_props, tag("szCs"), {tag("val"): "20"})
    paragraph.insert(0, props)


def build(source):
    root = etree.fromstring(source)
    body = root.find("w:body", NS)
    paragraphs = body.findall("w:p", NS)
    assert len(paragraphs) == 13, "ABK body template changed; check its slots before rebuilding"
    # The generated template lives at this path too. Re-running the builder
    # should be harmless; never try to reinterpret the already-reordered loops.
    if "{no}. " not in "".join(paragraphs[10].xpath(".//w:t/text()", namespaces=NS)):
        question = paragraphs[10]
        assert question.find("w:pPr/w:numPr/w:numId", NS).get(tag("val")) == "100"
        assert "{text}" in "".join(question.xpath(".//w:t/text()", namespaces=NS))
        return source
    assert "{no}. " in "".join(paragraphs[10].xpath(".//w:t/text()", namespaces=NS))

    title = deepcopy(paragraphs[5])
    for run in list(title.findall("w:r", NS)):
        if "每題" in "".join(run.xpath(".//w:t/text()", namespaces=NS)):
            title.remove(run)  # Per the current export requirement, do not print scoring.
    title_props = title.find("w:pPr", NS)
    if title_props is not None:
        etree.SubElement(title_props, tag("keepNext"))

    passage = deepcopy(paragraphs[7])
    passage_props = passage.find("w:pPr", NS)
    if passage_props is not None:
        etree.SubElement(passage_props, tag("keepNext"))

    question = deepcopy(paragraphs[10])
    for run in list(question.findall("w:r", NS)):
        if "{no}. " in "".join(run.xpath(".//w:t/text()", namespaces=NS)):
            question.remove(run)
    set_question_properties(question)

    # The passage loop is inside the item loop so each article precedes its
    # first question, not the entire group section.
    repeatable = [
        deepcopy(paragraphs[4]),  # {#sections}
        title,
        deepcopy(paragraphs[9]),  # {#items}
        deepcopy(paragraphs[6]),  # {#passage}
        passage,
        deepcopy(paragraphs[8]),  # {/passage}
        question,
        deepcopy(paragraphs[11]),  # {/items}
        deepcopy(paragraphs[12]),  # {/sections}
    ]
    for child in list(body)[4:-1]:
        body.remove(child)
    for child in repeatable:
        body.insert(len(body) - 1, child)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def main():
    with ZipFile(TEMPLATE) as original:
        replacement = build(original.read("word/document.xml"))
        with NamedTemporaryFile(dir=TEMPLATE.parent, suffix=".docx", delete=False) as temp:
            temporary = Path(temp.name)
        try:
            with ZipFile(temporary, "w") as output:
                for info in original.infolist():
                    data = replacement if info.filename == "word/document.xml" else original.read(info.filename)
                    output.writestr(info, data)
            temporary.replace(TEMPLATE)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
