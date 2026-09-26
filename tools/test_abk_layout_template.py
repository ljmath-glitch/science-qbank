"""Regression checks for the requested ABK text box and paragraph dialog."""

from zipfile import ZipFile
from lxml import etree
from build_abk_layout_template import A, NS, TEMPLATE, WP, build, tag


def check_body_layout(props, left="142"):
    expected = {
        "jc": {"val": "left"}, "outlineLvl": {"val": "9"},
        "ind": {"left": left, "right": "0", "hanging": "425"},
        "spacing": {"before": "0", "after": "120", "line": "240", "lineRule": "auto"},
        "adjustRightInd": {"val": "1"}, "snapToGrid": {"val": "0"},
        "contextualSpacing": {"val": "0"}, "mirrorIndents": {"val": "0"},
    }
    for name, attrs in expected.items():
        element = props.find(f"w:{name}", NS)
        assert element is not None, name
        assert {key.split("}")[-1]: value for key, value in element.attrib.items()} == attrs, name


with ZipFile(TEMPLATE) as package:
    source = package.read("word/document.xml")
    root = etree.fromstring(source)
    paragraphs = root.find("w:body", NS).findall("w:p", NS)
    question_props = paragraphs[10].find("w:pPr", NS)
    check_body_layout(question_props, left="567")
    question_indent = question_props.find("w:ind", NS)
    assert int(question_indent.get(tag("left"))) - int(question_indent.get(tag("hanging"))) == 142, "Question markers must stay inside both columns"
    assert [item.get(tag("pos")) for item in question_props.findall("w:tabs/w:tab", NS)] == ["0", "709", "1985", "3260", "4536"]
    assert paragraphs[10].find("w:pPr/w:numPr/w:numId", NS).get(tag("val")) == "100"
    passage = paragraphs[8]
    for inner in passage.xpath(".//w:txbxContent/w:p", namespaces=NS):
        check_body_layout(inner.find("w:pPr", NS))
        assert inner.find("w:pPr/w:numPr/w:numId", NS).get(tag("val")) == "108"
    extents = list(passage.iter(f"{{{WP}}}extent", f"{{{A}}}ext"))
    assert len(extents) == 2
    assert all(extent.get("cx") == "3967200" and extent.get("cy") == "2059200" for extent in extents)
    assert passage.xpath('.//*[local-name()="spAutoFit"]')
    assert passage.xpath('.//*[local-name()="bodyPr"]')[0].get("lIns") == "270000", "Keep the hanging bullet within the border"
    assert build(source) == source, "Rebuilding must be idempotent"
    assert paragraphs[5].find("w:pPr/w:numPr/w:numId", NS).get(tag("val")) == "87"
print("ABK paragraph settings, box dimensions, native numbering, and idempotence: PASS")
