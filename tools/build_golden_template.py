#!/usr/bin/env python3
"""Preserve the golden exam header; use the approved B4 prequiz body."""
import argparse
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
from build_prequiz_template import W, R, REL, NS, package, xml, fill_slot


def normalize_fonts(root):
    """Use the approved CJK/Latin pair, including inherited and list fonts."""
    for fonts in root.xpath('.//w:rFonts', namespaces=NS):
        fonts.attrib.clear()  # Theme font aliases must not override this pair.
        fonts.attrib.update({f'{{{W}}}ascii': 'Times New Roman',
                            f'{{{W}}}hAnsi': 'Times New Roman',
                            f'{{{W}}}eastAsia': 'DFPYuanMedium-B5',
                            f'{{{W}}}cs': 'Times New Roman'})


def compact_header_spacers(body):
    """Keep the filler slot indexes; reserve only enough room for the logo."""
    for index in (1, 2, 3):
        p = body[index]
        assert p.tag == f'{{{W}}}p' and not p.xpath('.//w:t', namespaces=NS)
        props = p.find('w:pPr', NS)
        if props is None:
            props = E.Element(f'{{{W}}}pPr'); p.insert(0, props)
        spacing = props.find('w:spacing', NS)
        if spacing is None:
            spacing = E.SubElement(props, f'{{{W}}}spacing')
        spacing.attrib.clear()
        # The anchored logo extends 7.8 pt below the header table. One 12-pt
        # clearance is enough; the old two full-size blank paragraphs are not.
        spacing.attrib.update({f'{{{W}}}before': '0',
                              f'{{{W}}}after': '240' if index == 1 else '0',
                              f'{{{W}}}line': '20', f'{{{W}}}lineRule': 'exact'})


def build(base_path, source_path, output):
    parts, source = package(base_path), package(source_path)
    root = E.fromstring(parts['word/document.xml'])
    body = root.find('w:body', NS)
    original_body = E.fromstring(source['word/document.xml']).find('w:body', NS)
    table, logo = deepcopy(original_body[0]), deepcopy(original_body[1])
    assert table.tag == f'{{{W}}}tbl'
    # The second source anchor is a question illustration, not part of the header.
    runs = logo.findall('w:r', NS)
    assert len(runs) == 2
    logo.remove(runs[1])
    slots = [
        '{gold_year} 學年度第 {gold_semester} 學期 {gold_subject}',
        '{gold_exam_title}', '版本：{gold_version}', '範圍：{gold_scope}',
    ]
    paragraphs = [p for p in table.xpath('.//w:p', namespaces=NS)
                  if ''.join(p.xpath('.//w:t/text()', namespaces=NS)).strip()]
    assert len(paragraphs) == 5
    for p, token in zip(paragraphs[:4], slots):
        fill_slot(p, token)
    width = 14570 - 720 * 2 - 80  # original 80-twip table indentation
    grid = table.find('w:tblGrid', NS)
    old = [int(col.get(f'{{{W}}}w')) for col in grid]
    scaled = [round(value * width / sum(old)) for value in old]
    scaled[-1] += width - sum(scaled)
    for col, value in zip(grid, scaled):
        col.set(f'{{{W}}}w', str(value))
    table.find('w:tblPr/w:tblW', NS).attrib.update({f'{{{W}}}w': str(width), f'{{{W}}}type': 'dxa'})
    for row in table.findall('w:tr', NS):
        offset = 0
        for cell in row.findall('w:tc', NS):
            span = cell.find('w:tcPr/w:gridSpan', NS)
            count = int(span.get(f'{{{W}}}val')) if span is not None else 1
            cell.find('w:tcPr/w:tcW', NS).set(f'{{{W}}}w', str(sum(scaled[offset:offset+count])))
            offset += count

    # Isolate source header styles so the approved body defaults never change.
    styles = E.fromstring(parts['word/styles.xml'])
    source_styles = E.fromstring(source['word/styles.xml'])
    style_ids = ['Normal', 'TableNormal', 'TableGrid', 'Footer', 'PageNumber']
    for style_id in style_ids:
        found = source_styles.xpath('./w:style[@w:styleId="'+style_id+'"]', namespaces=NS)
        if not found:
            continue
        style = deepcopy(found[0]);style.set(f'{{{W}}}styleId', 'GoldenSource_'+style_id)
        style.attrib.pop(f'{{{W}}}default', None)
        if style_id == 'Normal':
            props = E.SubElement(style, f'{{{W}}}rPr')
            E.SubElement(props, f'{{{W}}}rFonts', {f'{{{W}}}ascii':'Times New Roman', f'{{{W}}}hAnsi':'Times New Roman', f'{{{W}}}eastAsia':'DFPYuanMedium-B5'})
            E.SubElement(props, f'{{{W}}}sz', {f'{{{W}}}val':'24'})
        for ref in style.xpath('./w:basedOn|./w:next|./w:link', namespaces=NS):
            if ref.get(f'{{{W}}}val') in style_ids:
                ref.set(f'{{{W}}}val', 'GoldenSource_'+ref.get(f'{{{W}}}val'))
        styles.append(style)

    footer = E.fromstring(source['word/footer1.xml'])
    for text in footer.xpath('.//w:t', namespaces=NS):
        if text.text == '理化':
            text.text = '{gold_footer_subject}'
    for node in [table, logo, footer]:
        for ref in node.xpath('.//w:pStyle|.//w:rStyle|.//w:tblStyle', namespaces=NS):
            if ref.get(f'{{{W}}}val') in style_ids:
                ref.set(f'{{{W}}}val', 'GoldenSource_'+ref.get(f'{{{W}}}val'))
        for p in node.xpath('.//w:p', namespaces=NS):
            props = p.find('w:pPr', NS)
            if props is None:
                props = E.Element(f'{{{W}}}pPr');p.insert(0, props)
            if props.find('w:pStyle', NS) is None:
                props.insert(0, E.Element(f'{{{W}}}pStyle', {f'{{{W}}}val':'GoldenSource_Normal'}))

    rels = E.fromstring(parts['word/_rels/document.xml.rels'])
    source_rels = {n.get('Id'):n for n in E.fromstring(source['word/_rels/document.xml.rels'])}
    blip = logo.find('.//a:blip', NS)
    image_rel = source_rels[blip.get(f'{{{R}}}embed')]
    parts['word/media/golden_logo.png'] = source['word/'+image_rel.get('Target')]
    blip.set(f'{{{R}}}embed', 'rIdGoldenLogo')
    E.SubElement(rels, f'{{{REL}}}Relationship', Id='rIdGoldenLogo', Type=R+'/image', Target='media/golden_logo.png')
    body.replace(body[0], table);body.replace(body[1], logo)
    compact_header_spacers(body)
    for name in ('word/header1.xml', 'word/header2.xml'):
        header = E.fromstring(parts[name])
        for child in list(header):
            header.remove(child)
        E.SubElement(header, f'{{{W}}}p')
        parts[name] = xml(header)
    for name in [name for name in parts if name.startswith('word/footer') and name.endswith('.xml')]:
        parts[name] = xml(footer)
    parts['word/document.xml'] = xml(root)
    parts['word/styles.xml'] = xml(styles)
    parts['word/_rels/document.xml.rels'] = xml(rels)
    # Source header/footer direct formatting previously kept a third font,
    # even when the Normal style was corrected. Normalize every Word text
    # part so metadata, body, native list markers and PAGE fields agree.
    for name in list(parts):
        if name.startswith('word/') and name.endswith('.xml'):
            tree = E.fromstring(parts[name])
            if tree.xpath('.//w:rFonts', namespaces=NS):
                normalize_fonts(tree)
                parts[name] = xml(tree)
    output = Path(output)
    if output.exists():
        raise FileExistsError(output)
    with ZipFile(output, 'w', ZIP_DEFLATED) as z:
        for name, raw in parts.items():
            z.writestr(name, raw)
    # Preserve all approved ruler/list/paragraph/shape settings. Only font
    # declarations and the three header spacer paragraphs may differ.
    before = E.fromstring(package(base_path)['word/document.xml']).find('w:body', NS)
    normalize_fonts(before)
    normalize_fonts(body)
    compact_header_spacers(before)
    assert all(E.tostring(before[i], method='c14n') == E.tostring(body[i], method='c14n') for i in range(2, len(body)))
    numbering = E.fromstring(package(base_path)['word/numbering.xml'])
    normalize_fonts(numbering)
    assert E.tostring(numbering, method='c14n') == E.tostring(E.fromstring(parts['word/numbering.xml']), method='c14n')
    with ZipFile(output) as z:
        assert z.testzip() is None
    # This is the source logo, not a flattened screenshot of the header.
    Path(output).with_name('golden_logo.png').write_bytes(parts['word/media/golden_logo.png'])
    print('PASS: B4 prequiz body preserved; golden native header and PAGE footer:', output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--header-source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    build(args.base, args.header_source, args.output)
