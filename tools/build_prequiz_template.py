#!/usr/bin/env python3
"""Derive prequiz from approved ABK: prequiz header, one column, no watermark."""
import argparse
from copy import deepcopy
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
V = 'urn:schemas-microsoft-com:vml'
NS = {'w': W, 'a': A, 'wp': WP, 'r': R, 'v': V,
      'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
      'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'}


def package(path):
    with ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist()}


def xml(node):
    return E.tostring(node, encoding='UTF-8', xml_declaration=True, standalone=True)


def remove_watermark(hdr):
    """Remove only the inherited low-opacity ABK background picture."""
    removed = 0
    for run in list(hdr.xpath('.//w:r', namespaces=NS)):
        if run.xpath('.//a:blip[a:alphaModFix[@amt="10000"]]', namespaces=NS):
            run.getparent().remove(run)
            removed += 1
    return removed


def fill_slot(paragraph, token):
    runs = paragraph.findall('w:r', NS)
    props = deepcopy(runs[0].find('w:rPr', NS)) if runs else None
    for c in list(paragraph):
        if c.tag != f'{{{W}}}pPr':
            paragraph.remove(c)
    run = E.SubElement(paragraph, f'{{{W}}}r')
    if props is not None:
        run.append(props)
    E.SubElement(run, f'{{{W}}}t').text = token


def build(abk, source, output):
    parts, pre = package(abk), package(source)
    root, original = E.fromstring(parts['word/document.xml']), E.fromstring(pre['word/document.xml'])
    body = root.find('w:body', NS)
    header = deepcopy(original.find('w:body', NS)[0])
    # Keep all editable native shapes and their VML fallback, not a screenshot.
    for container in header.xpath('.//wps:txbx/w:txbxContent|.//v:textbox/w:txbxContent', namespaces=NS):
        p = container.find('w:p', NS)
        text = ''.join(p.xpath('.//w:t/text()', namespaces=NS))
        token = '{subject}' if '國八理化' in text else '{book}' if '第三冊' in text else '{quiz_label}'
        fill_slot(p, token)
    # Extend only the horizontal gray background to B4. Logo, separator, type
    # sizes and child shape geometry stay at the source's physical dimensions.
    width = (14570 - 720 * 2) * 635
    anchor = header.find('.//wp:anchor', NS)
    old_width = int(anchor.find('wp:extent', NS).get('cx'))
    delta = width - old_width
    anchor.find('wp:extent', NS).set('cx', str(width))
    for tag in ('ext', 'chExt'):
        header.find(f'.//wpg:grpSpPr/a:xfrm/a:{tag}', NS).set('cx', str(width))
    shapes = header.xpath('.//wps:wsp', namespaces=NS)
    for shape in shapes:
        text = ''.join(shape.xpath('.//w:t/text()', namespaces=NS))
        ext = shape.find('wps:spPr/a:xfrm/a:ext', NS)
        if ext is not None and ((not text and int(ext.get('cx')) > 6000000) or text == '{quiz_label}'):
            ext.set('cx', str(int(ext.get('cx')) + delta))
    group = header.find('.//v:group', NS)
    coord = group.get('coordsize').split(',')
    coord[0] = str(round(width / 100))
    group.set('coordsize', ','.join(coord))
    group.set('style', re.sub(r'width:[^;]+', f'width:{width / 12700:.3f}pt', group.get('style')))
    for shape in group.findall('v:shape', NS):
        text = ''.join(shape.xpath('.//w:t/text()', namespaces=NS))
        style = shape.get('style', '')
        match = re.search(r'width:(\d+)', style)
        if match and ((not text and int(match[1]) > 60000) or text == '{quiz_label}'):
            shape.set('style', re.sub(r'width:\d+', f'width:{int(match[1]) + round(delta/100)}', style))

    rels = E.fromstring(parts['word/_rels/document.xml.rels'])
    source_rels = {n.get('Id'): n for n in E.fromstring(pre['word/_rels/document.xml.rels'])}
    mapping = {}
    for node in header.iter():
        for key, old in list(node.attrib.items()):
            if key.startswith(f'{{{R}}}'):
                if old not in mapping:
                    rel = source_rels[old]
                    assert rel.get('Type') == R + '/image' and rel.get('TargetMode') is None
                    suffix = Path(rel.get('Target')).suffix
                    target = f'media/prequiz_header_{len(mapping)+1}{suffix}'
                    rid = f'rIdPrequizHeader{len(mapping)+1}'
                    assert all(n.get('Id') != rid for n in rels)
                    assert 'word/' + target not in parts
                    parts['word/' + target] = pre['word/' + rel.get('Target')]
                    E.SubElement(rels, f'{{{REL}}}Relationship', Id=rid, Type=R + '/image', Target=target)
                    mapping[old] = rid
                node.set(key, mapping[old])
    # Retain the four-slot ABK layout contract used by both template fillers.
    # Only the header paragraph's visual content is replaced.
    body.replace(body[0], header)
    for cols in root.xpath('.//w:sectPr/w:cols', namespaces=NS):
        cols.set(f'{{{W}}}num', '1')
        cols.set(f'{{{W}}}sep', '0')
        for child in list(cols):
            cols.remove(child)

    pre_running = E.fromstring(pre['word/header1.xml']).find('w:p', NS)
    fill_slot(pre_running, '{running_header}')
    # Replace ABK's top brand/code row and remove its background watermark.
    # Keep unused media/relationships to preserve all unrelated package parts.
    for name in ('word/header1.xml', 'word/header2.xml'):
        hdr = E.fromstring(parts[name])
        assert remove_watermark(hdr) == 1, name
        for drawing in hdr.xpath('.//wp:docPr[@name="Group 18"]', namespaces=NS):
            run = drawing
            while run.getparent() is not None and run.tag != f'{{{W}}}r':
                run = run.getparent()
            assert run.tag == f'{{{W}}}r'
            run.getparent().remove(run)
        first = hdr.find('w:p', NS)
        for run in first.findall('w:r', NS):
            if not run.xpath('.//w:drawing|.//w:pict', namespaces=NS):
                first.remove(run)
        # The prequiz running header has text only; its body logo is untouched.
        for run in pre_running.findall('w:r', NS):
            first.append(deepcopy(run))
        first.find('w:pPr', NS).replace(first.find('w:pPr/w:rPr', NS), deepcopy(pre_running.find('w:pPr/w:rPr', NS)))
        props = first.find('w:pPr', NS)
        alignment = props.find('w:jc', NS)
        if alignment is None:
            alignment = E.SubElement(props, f'{{{W}}}jc')
        alignment.set(f'{{{W}}}val', 'left')
        parts[name] = xml(hdr)
    parts['word/document.xml'] = xml(root)
    parts['word/_rels/document.xml.rels'] = xml(rels)
    output = Path(output)
    if output.exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED) as z:
        for name, raw in parts.items():
            z.writestr(name, raw)

    # Only header, column count, and imported header media may differ.
    allowed = {'word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/_rels/document.xml.rels'}
    base = package(abk)
    assert all(parts[n] == raw for n, raw in base.items() if n not in allowed)
    base_root = E.fromstring(base['word/document.xml'])
    old_body = base_root.find('w:body', NS)
    for index in range(1, len(body)):
        before, after = deepcopy(old_body[index]), deepcopy(body[index])
        for node in before.xpath('.//w:cols|self::w:cols', namespaces=NS) + after.xpath('.//w:cols|self::w:cols', namespaces=NS):
            node.set(f'{{{W}}}num', '1')
            node.set(f'{{{W}}}sep', '0')
        assert E.tostring(before, method='c14n') == E.tostring(after, method='c14n'), index
    print(f'PASS: header replaced; single column; no watermark; {len(base)-len(allowed)} original parts preserved; body slots unchanged. {output}')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--abk', type=Path, required=True)
    p.add_argument('--header-source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    build(a.abk, a.header_source, a.output)
