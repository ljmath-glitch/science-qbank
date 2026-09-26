"""Keep the ABK page furniture while rebuilding its repeatable exam body.

The source template already contains the approved B4 header, watermark, and
numbering definition (numId 100). The group-passage bullet adds numId 108.
"""

from copy import deepcopy
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from lxml import etree


TEMPLATE = Path(__file__).resolve().parents[1] / "templates" / "abk_tpl.docx"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
PASSAGE_WIDTH_EMU = "3967200"  # 11.02 cm, as specified in the Word screenshot.
PASSAGE_HEIGHT_EMU = "2059200"  # Initial 5.72 cm; spAutoFit grows with the article.


def tag(name):
    return f"{{{W}}}{name}"


def ns_tag(namespace, name):
    return f"{{{namespace}}}{name}"


def set_body_layout(props):
    """Match the supplied Word Paragraph dialog, without style inheritance."""
    etree.SubElement(props, tag("adjustRightInd"), {tag("val"): "1"})
    etree.SubElement(props, tag("snapToGrid"), {tag("val"): "0"})
    etree.SubElement(props, tag("spacing"), {
        tag("before"): "0", tag("after"): "120",
        tag("line"): "240", tag("lineRule"): "auto",
    })
    etree.SubElement(props, tag("ind"), {
        tag("left"): "142", tag("right"): "0", tag("hanging"): "425",
    })
    etree.SubElement(props, tag("contextualSpacing"), {tag("val"): "0"})
    etree.SubElement(props, tag("mirrorIndents"), {tag("val"): "0"})
    etree.SubElement(props, tag("jc"), {tag("val"): "left"})
    etree.SubElement(props, tag("outlineLvl"), {tag("val"): "9"})


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
    set_body_layout(props)
    # Numbered questions need their own ruler: the marker starts at 0.25 cm,
    # and the stem/continuation text at 1 cm (0.75 cm hanging). Using the
    # article's 0.25 cm text indent puts the marker outside the column.
    props.find("w:ind", NS).set(tag("left"), "567")
    run_props = etree.SubElement(props, tag("rPr"))
    etree.SubElement(
        run_props,
        tag("rFonts"),
        {tag("ascii"): "Times New Roman", tag("hAnsi"): "Times New Roman", tag("eastAsia"): "DFPYuanMedium-B5"},
    )
    etree.SubElement(run_props, tag("sz"), {tag("val"): "20"})
    etree.SubElement(run_props, tag("szCs"), {tag("val"): "20"})
    paragraph.insert(0, props)


def set_heading_properties(paragraph):
    """Use the supplied ABK template's section-heading ruler and native list."""
    old = paragraph.find("w:pPr", NS)
    if old is not None:
        paragraph.remove(old)
    props = etree.Element(tag("pPr"))
    etree.SubElement(props, tag("pStyle"), {tag("val"): "ListParagraph"})
    numbering = etree.SubElement(props, tag("numPr"))
    etree.SubElement(numbering, tag("ilvl"), {tag("val"): "0"})
    etree.SubElement(numbering, tag("numId"), {tag("val"): "87"})
    tabs = etree.SubElement(props, tag("tabs"))
    etree.SubElement(tabs, tag("tab"), {tag("val"): "left", tag("pos"): "0"})
    etree.SubElement(props, tag("spacing"), {tag("after"): "120", tag("line"): "288", tag("lineRule"): "auto"})
    etree.SubElement(props, tag("ind"), {tag("left"): "284", tag("hanging"): "567"})
    run_props = etree.SubElement(props, tag("rPr"))
    etree.SubElement(run_props, tag("rFonts"), {tag("eastAsia"): "DFPYuanMedium-B5"})
    etree.SubElement(run_props, tag("sz"), {tag("val"): "20"})
    etree.SubElement(run_props, tag("szCs"), {tag("val"): "20"})
    paragraph.insert(0, props)

    text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))
    if "每題＿＿分，共＿＿分" not in text:
        score = etree.SubElement(paragraph, tag("r"))
        score_props = etree.SubElement(score, tag("rPr"))
        etree.SubElement(
            score_props,
            tag("rFonts"),
            {tag("ascii"): "Times New Roman", tag("hAnsi"): "Times New Roman", tag("eastAsia"): "DFPYuanMedium-B5"},
        )
        etree.SubElement(score_props, tag("sz"), {tag("val"): "20"})
        etree.SubElement(score_props, tag("szCs"), {tag("val"): "20"})
        score_text = etree.SubElement(score, tag("t"), {"{http://www.w3.org/XML/1998/namespace}space": "preserve"})
        score_text.text = "  /每題＿＿分，共＿＿分"


def set_passage_properties(paragraph):
    """Put the real ◎ bullet at the top of an inline, editable Word text box."""
    existing = paragraph.xpath(".//w:txbxContent/w:p", namespaces=NS)
    if existing:
        outer = paragraph.find("w:pPr", NS)
        for child in list(outer):
            if child.tag in {tag("pStyle"), tag("numPr"), tag("tabs"), tag("ind")}:
                outer.remove(child)
        for inner in existing:
            inner_props = inner.find("w:pPr", NS)
            if inner_props is None:
                inner_props = etree.Element(tag("pPr"))
                inner.insert(0, inner_props)
            for child in list(inner_props):
                inner_props.remove(child)
            set_inner_passage_properties(inner_props)
        for extent in paragraph.iter(ns_tag(WP, "extent"), ns_tag(A, "ext")):
            extent.set("cx", PASSAGE_WIDTH_EMU)
            extent.set("cy", PASSAGE_HEIGHT_EMU)
        # The requested hanging indent puts the bullet 0.5 cm to the left
        # of the text origin. Reserve space inside the box, not outside it.
        for body in paragraph.iter(ns_tag(WPS, "bodyPr")):
            body.set("lIns", "270000")
        return
    runs = [deepcopy(run) for run in paragraph.findall("w:r", NS)]
    for run in runs:
        for text in run.xpath(".//w:t", namespaces=NS):
            if text.text and text.text.startswith("◎ "):
                text.text = text.text[2:]
    for child in list(paragraph):
        paragraph.remove(child)

    props = etree.SubElement(paragraph, tag("pPr"))
    etree.SubElement(props, tag("spacing"), {tag("after"): "120"})

    run = etree.SubElement(paragraph, tag("r"))
    drawing = etree.SubElement(run, tag("drawing"))
    inline = etree.SubElement(drawing, ns_tag(WP, "inline"), {"distT": "0", "distB": "0", "distL": "0", "distR": "0"})
    etree.SubElement(inline, ns_tag(WP, "extent"), {"cx": PASSAGE_WIDTH_EMU, "cy": PASSAGE_HEIGHT_EMU})
    etree.SubElement(inline, ns_tag(WP, "docPr"), {"id": "9000001", "name": "Group Passage"})
    etree.SubElement(inline, ns_tag(WP, "cNvGraphicFramePr"))
    graphic = etree.SubElement(inline, ns_tag(A, "graphic"))
    graphic_data = etree.SubElement(graphic, ns_tag(A, "graphicData"), {"uri": WPS})
    shape = etree.SubElement(graphic_data, ns_tag(WPS, "wsp"))
    etree.SubElement(shape, ns_tag(WPS, "cNvSpPr"), {"txBox": "1"})
    shape_props = etree.SubElement(shape, ns_tag(WPS, "spPr"))
    transform = etree.SubElement(shape_props, ns_tag(A, "xfrm"))
    etree.SubElement(transform, ns_tag(A, "off"), {"x": "0", "y": "0"})
    etree.SubElement(transform, ns_tag(A, "ext"), {"cx": PASSAGE_WIDTH_EMU, "cy": PASSAGE_HEIGHT_EMU})
    geometry = etree.SubElement(shape_props, ns_tag(A, "prstGeom"), {"prst": "rect"})
    etree.SubElement(geometry, ns_tag(A, "avLst"))
    etree.SubElement(shape_props, ns_tag(A, "noFill"))
    line = etree.SubElement(shape_props, ns_tag(A, "ln"), {"w": "6350"})
    fill = etree.SubElement(line, ns_tag(A, "solidFill"))
    etree.SubElement(fill, ns_tag(A, "prstClr"), {"val": "black"})
    text_box = etree.SubElement(shape, ns_tag(WPS, "txbx"))
    content = etree.SubElement(text_box, tag("txbxContent"))
    inner = etree.SubElement(content, tag("p"))
    inner_props = etree.SubElement(inner, tag("pPr"))
    set_inner_passage_properties(inner_props)
    for child in runs:
        inner.append(child)
    body = etree.SubElement(
        shape,
        ns_tag(WPS, "bodyPr"),
        {"rot": "0", "vert": "horz", "wrap": "square", "lIns": "270000", "tIns": "45720", "rIns": "91440", "bIns": "45720"},
    )
    etree.SubElement(body, ns_tag(A, "spAutoFit"))


def set_inner_passage_properties(inner_props):
    etree.SubElement(inner_props, tag("pStyle"), {tag("val"): "ListParagraph"})
    number = etree.SubElement(inner_props, tag("numPr"))
    etree.SubElement(number, tag("ilvl"), {tag("val"): "0"})
    etree.SubElement(number, tag("numId"), {tag("val"): "108"})
    tabs = etree.SubElement(inner_props, tag("tabs"))
    etree.SubElement(tabs, tag("tab"), {tag("val"): "left", tag("pos"): "0"})
    set_body_layout(inner_props)


def ensure_group_bullet_numbering(source):
    root = etree.fromstring(source)
    if root.xpath('./w:num[@w:numId="108"]', namespaces=NS):
        return source
    abstract_ids = [int(item.get(tag("abstractNumId"))) for item in root.findall("w:abstractNum", NS)]
    abstract_id = str(max(abstract_ids) + 1)
    abstract = etree.Element(tag("abstractNum"), {tag("abstractNumId"): abstract_id})
    etree.SubElement(abstract, tag("multiLevelType"), {tag("val"): "singleLevel"})
    level = etree.SubElement(abstract, tag("lvl"), {tag("ilvl"): "0"})
    etree.SubElement(level, tag("start"), {tag("val"): "1"})
    etree.SubElement(level, tag("numFmt"), {tag("val"): "bullet"})
    etree.SubElement(level, tag("lvlText"), {tag("val"): "◎"})
    etree.SubElement(level, tag("lvlJc"), {tag("val"): "left"})
    etree.SubElement(level, tag("suff"), {tag("val"): "space"})
    level_props = etree.SubElement(level, tag("pPr"))
    etree.SubElement(level_props, tag("ind"), {tag("left"): "284", tag("hanging"): "284"})
    run_props = etree.SubElement(level, tag("rPr"))
    etree.SubElement(run_props, tag("rFonts"), {tag("eastAsia"): "DFPYuanMedium-B5"})
    etree.SubElement(run_props, tag("sz"), {tag("val"): "20"})
    first_num = root.find("w:num", NS)
    root.insert(root.index(first_num), abstract)
    number = etree.SubElement(root, tag("num"), {tag("numId"): "108"})
    etree.SubElement(number, tag("abstractNumId"), {tag("val"): abstract_id})
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def build(source):
    root = etree.fromstring(source)
    body = root.find("w:body", NS)
    paragraphs = body.findall("w:p", NS)
    assert len(paragraphs) == 13, "ABK body template changed; check its slots before rebuilding"
    # The generated template lives at this path too. Re-running the builder
    # updates formatting without reinterpreting already-reordered loops.
    if "{no}. " not in "".join(paragraphs[10].xpath(".//w:t/text()", namespaces=NS)):
        question = paragraphs[10]
        assert question.find("w:pPr/w:numPr/w:numId", NS).get(tag("val")) == "100"
        assert "{text}" in "".join(question.xpath(".//w:t/text()", namespaces=NS))
        heading = paragraphs[5]
        assert "{title}" in "".join(heading.xpath(".//w:t/text()", namespaces=NS))
        set_heading_properties(heading)
        set_question_properties(question)
        set_passage_properties(paragraphs[8])
        return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    assert "{no}. " in "".join(paragraphs[10].xpath(".//w:t/text()", namespaces=NS))

    title = deepcopy(paragraphs[5])
    for run in list(title.findall("w:r", NS)):
        if "每題" in "".join(run.xpath(".//w:t/text()", namespaces=NS)):
            title.remove(run)  # Per the current export requirement, do not print scoring.
    set_heading_properties(title)

    passage = deepcopy(paragraphs[7])
    set_passage_properties(passage)

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
        numbering = ensure_group_bullet_numbering(original.read("word/numbering.xml"))
        with NamedTemporaryFile(dir=TEMPLATE.parent, suffix=".docx", delete=False) as temp:
            temporary = Path(temp.name)
        try:
            with ZipFile(temporary, "w") as output:
                for info in original.infolist():
                    data = replacement if info.filename == "word/document.xml" else numbering if info.filename == "word/numbering.xml" else original.read(info.filename)
                    output.writestr(info, data)
            temporary.replace(TEMPLATE)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
