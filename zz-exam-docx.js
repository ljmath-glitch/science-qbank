/* 茲茲考卷 Word 產生器（課前考／ABK／黃金模擬考／會考模擬考題本／詳解卷）
 * 版面照「茲茲講義素材」(zz-handout) 的考卷範本：閃電斜塊卷頭、雙線收尾、灰階大題、
 * 茲茲題目 12 pt＋定位點 3000/5280/7560、題組框、頁首頁尾；黑白影印也清楚。內文華康中圓體＋Times New Roman，卷頭與大題 jf金萱那提 2.0；五套整套風格（STYLES）。
 * 直接組出 .docx（不用範本檔），用頁面已載入的 JSZip 打包。預設 A4、四邊界 1 cm，可選 B4。
 * 入口：await ZZExam.buildDocx(spec) → Blob。spec 格式見檔尾 buildDocx 的註解。
 */
(function () {
  'use strict';
  // ---------------- 基本單位與文字 ----------------
  const E = (cm) => Math.round(cm * 360000);          // cm → EMU
  const TW = (cm) => Math.round(cm * 567);            // cm → twips
  const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // 茲茲規則：「・」「‧」一律換成「·」（原本華康中圓體缺字；金萱有，但維持同一寫法）
  const fixGlyph = (s) => String(s == null ? '' : s).replace(/[・‧]/g, '·');
  const esc = (s) => xesc(fixGlyph(s));
  const hex = (c) => String(c || '1A1A1A').replace('#', '').toUpperCase();

  // 字型：jf金萱那提 2.0（Windows、Mac 都有）。OOXML 一律寫英文字族名，Windows Word 才找得到；
  // 每個字重是獨立字族，粗體＝換成 Bold 字族，不加 <w:b/>（避免假粗體）。
  const JF = { reg: 'jf-jinxuanlatte-2.0 Regular', bold: 'jf-jinxuanlatte-2.0 Bold', semi: 'jf-jinxuanlatte-2.0 SemiBold', heavy: 'jf-jinxuanlatte-2.0 Heavy' };
  const FT = JF.reg;
  const HK = '華康中圓體(P)';   // 內文（題目、選項、詳解）維持華康中圓體＋Times New Roman；金萱只用在卷頭、大題等非內文
  const F = { title: JF.bold, head: JF.bold, body: ['Times New Roman', HK], code: JF.semi, codeB: JF.semi, heavy: JF.heavy };
  const isJF = (f) => String(f || '').startsWith('jf-');
  // 金萱那提沒有的字（² ³ ⁻ ₂ ≤ ≥ ≈ ✓ ✗ ⚠ ▶ 等）：這些字一律改用 Times New Roman／系統字
  const NOJF = /[\u00B2\u00B3\u00B9\u2070-\u209F\u2264\u2265\u2248\u2713\u2717\u26A0\u270E\u25B6\u25A2]/;
  const INK = '#1A1A1A', G1 = '#595959', G2 = '#8C8C8C', GOLD = '#AF9A6B', RED = '#850103', ANS = '#C00000';

  // ---------------- 整套風格（老師在匯出視窗選一套；內文字型、題目排版每套都一樣） ----------------
  // ac＝主色（卷頭色塊、雙線、大題左條、題組框）；tint＝淡底色；head＝卷頭樣式；sec＝大題樣式；box＝題組框樣式；wm＝ABK 浮水印
  const SUBJECT_COLORS = { 理化: ['#D2486E', '#FBEFF3'], 生物: ['#2E8B57', '#EEF7F1'], 地科: ['#0E7C9B', '#EAF6F9'], 自然: ['#3E63DD', '#EEF2FB'] };
  const STYLES = {
    formal: { name: '茲茲正式版', ac: INK, tint: '#F2F2F2', head: 'zz', sec: 'bar', box: 'round', wm: true },
    redgold: { name: '茲茲紅金', ac: RED, tint: '#F6F1E7', head: 'zz', sec: 'bar', box: 'round', wm: true },
    subject: { name: '科目彩色講義', ac: '#3E63DD', tint: '#EEF2FB', head: 'band', sec: 'tint', box: 'tint', wm: false },
    simple: { name: '簡潔省墨', ac: INK, tint: '#FFFFFF', head: 'line', sec: 'rule', box: 'thin', wm: false },
    exam: { name: '會考仿真', ac: INK, tint: '#FFFFFF', head: 'cap', sec: 'plain', box: 'square', wm: false },
  };
  let TH = STYLES.formal;
  function pickStyle(id, field) {
    const t = { ...(STYLES[id] || STYLES.formal) };
    if (id === 'subject') { const c = SUBJECT_COLORS[field] || SUBJECT_COLORS['自然']; t.ac = c[0]; t.tint = c[1]; }
    return t;
  }

  function rPr(o) {
    o = o || {};
    const ff = o.font ? [].concat(o.font) : null;
    const rf = ff ? `<w:rFonts w:ascii="${ff[0]}" w:hAnsi="${ff[0]}" w:eastAsia="${ff[1] || ff[0]}" w:cs="${ff[0]}"/>` : '';
    const b = !!o.b && !isJF(ff ? ff[0] : '');   // 金萱那提的粗細靠字族，只有 Times New Roman 才加 <w:b/>
    return `<w:rPr>${rf}${b ? '<w:b/><w:bCs/>' : ''}${o.c ? `<w:color w:val="${hex(o.c)}"/>` : ''}${o.sp != null ? `<w:spacing w:val="${Math.round(o.sp * 20)}"/>` : ''}${o.s ? `<w:sz w:val="${Math.round(o.s * 2)}"/><w:szCs w:val="${Math.round(o.s * 2)}"/>` : ''}${o.hl ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(o.hl)}"/>` : ''}${o.u ? `<w:u w:val="${o.u}"/>` : ''}${o.vanish ? '<w:vanish/>' : ''}</w:rPr>`;
  }
  // 依字元把一段字拆成數個 run：金萱沒有的字 → Times New Roman；正文（Times＋金萱）粗體時，中文字改用 Bold 字族
  function fontFor(o, cls) {
    const ff = o.font ? [].concat(o.font) : null;
    if (cls === 'tnr') return { ...o, font: 'Times New Roman' };
    if (!ff) return o;
    if (ff.length === 1 && ff[0] === JF.bold && o.b === false) return { ...o, font: JF.reg };   // 「不加粗」的標題字 → 一般字重
    if (ff.length > 1 && o.b && isJF(ff[1]) && cls === 'cjk') return { ...o, font: JF.bold };
    return o;
  }
  function R(t, o) {
    o = o || {};
    if (t === '\t') return `<w:r>${rPr(fontFor(o, 'lat'))}<w:tab/></w:r>`;
    const ff0 = o.font ? [].concat(o.font) : [];
    const splitCJK = ff0.length > 1 && !!o.b && isJF(ff0[1]);   // 只有「正文粗體」才需要把中文字分開
    const segs = []; let cur = null, buf = '';
    for (const ch of fixGlyph(t)) {
      const cls = NOJF.test(ch) ? 'tnr' : splitCJK && ch.codePointAt(0) > 0x2e80 ? 'cjk' : 'lat';
      if (cls !== cur && buf) { segs.push([cur, buf]); buf = ''; }
      cur = cls; buf += ch;
    }
    if (buf || !segs.length) segs.push([cur || 'lat', buf]);
    return segs.map(([cls, x]) => `<w:r>${rPr(fontFor(o, cls))}<w:t xml:space="preserve">${xesc(x)}</w:t></w:r>`).join('');
  }
  // 題目文字：\n → 換行（Shift+Enter）、\t → Tab；私用字元 /… = 雙／單底線
  function RT(text, o) {
    const out = []; let u = null;
    String(text == null ? '' : text).split(/([\n\t])/).forEach((part) => {
      if (!part) return;
      if (part === '') { u = 'double'; return; }
      if (part === '') { u = 'single'; return; }
      if (part === '') { u = null; return; }
      if (part === '\n') { out.push('<w:r><w:br/></w:r>'); return; }
      if (part === '\t') { out.push(R('\t', o)); return; }
      out.push(R(part, u ? { ...o, u } : o));
    });
    return out.join('');
  }
  // 段落（照 zz-handout lib.P）：jc、sb/sa 段前後(pt)、ls 行距倍數、tabs(cm)、ind(cm)、style、kn keepNext、sect
  function P(content, o) {
    o = o || {};
    const tabs = o.tabs ? `<w:tabs>${o.tabs.map((t) => `<w:tab w:val="${t.v || 'left'}" w:pos="${t.tw != null ? t.tw : TW(t.pos)}"/>`).join('')}</w:tabs>` : '';
    const line = `w:line="${Math.round((o.ls || 1) * 240)}" w:lineRule="auto"`;
    const bdr = o.bdr ? `<w:pBdr>${o.bdr}</w:pBdr>` : '';
    const ind = o.indTw ? `<w:ind w:left="${o.indTw.l || 0}" w:right="${o.indTw.r || 0}"${o.indTw.h ? ` w:hanging="${o.indTw.h}"` : ''}/>`
      : o.ind ? `<w:ind w:left="${TW(o.ind.l || 0)}" w:right="${TW(o.ind.r || 0)}"${o.ind.h ? ` w:hanging="${TW(o.ind.h)}"` : ''}/>`
        : o.style ? '' : '<w:ind w:left="0" w:firstLine="0"/>';
    const sp = o.style && o.sb == null && o.sa == null && !o.ls ? '' : `<w:spacing w:before="${Math.round((o.sb || 0) * 20)}" w:after="${Math.round((o.sa || 0) * 20)}" ${line}/>`;
    const body = Array.isArray(content) ? content.join('') : content || '';
    const own = body.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, '');
    const szs = [...own.matchAll(/<w:sz w:val="(\d+)"\/>/g)].map((m) => +m[1]);
    const rf = own.match(/<w:rFonts [^>]*\/>/);
    const mark = szs.length && !o.style ? `<w:rPr>${rf ? rf[0] : ''}<w:sz w:val="${Math.max(...szs)}"/><w:szCs w:val="${Math.max(...szs)}"/></w:rPr>` : '';
    return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.kn ? '<w:keepNext/>' : ''}${o.kl ? '<w:keepLines/>' : ''}${o.pb ? '<w:pageBreakBefore/>' : ''}${bdr}${o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(o.shd)}"/>` : ''}${tabs}<w:snapToGrid w:val="0"/>${sp}${ind}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}${mark}${o.sect || ''}</w:pPr>${body}</w:p>`;
  }

  // ---------------- 形狀（照 zz-handout lib.js） ----------------
  let ID = 2000, Z = 251660000;
  const dml = (c, alpha) => `<a:srgbClr val="${hex(c)}">${alpha != null ? `<a:alpha val="${alpha * 1000}"/>` : ''}</a:srgbClr>`;
  const fillX = (s) => (s.fill ? `<a:solidFill>${dml(s.fill, s.fa)}</a:solidFill>` : '<a:noFill/>');
  const lnX = (s) => (!s.ln ? '<a:ln><a:noFill/></a:ln>' : `<a:ln w="${Math.round((s.lw || 1) * 12700)}"><a:solidFill>${dml(s.ln)}</a:solidFill><a:round/></a:ln>`);
  function geomX(s, wE, hE) {
    if (s.path) {
      const pt = (x, y) => `<a:pt x="${E(x)}" y="${E(y)}"/>`;
      const cmds = s.path.map((c) => c[0] === 'M' ? `<a:moveTo>${pt(c[1], c[2])}</a:moveTo>` : c[0] === 'L' ? `<a:lnTo>${pt(c[1], c[2])}</a:lnTo>`
        : c[0] === 'C' ? `<a:cubicBezTo>${pt(c[1], c[2])}${pt(c[3], c[4])}${pt(c[5], c[6])}</a:cubicBezTo>` : '<a:close/>').join('');
      return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${wE}" h="${hE}">${cmds}</a:path></a:pathLst></a:custGeom>`;
    }
    const av = { ...(s.av || {}) };
    if (s.r != null) av.adj = Math.round(s.r * 1000);
    return `<a:prstGeom prst="${s.g || (s.r != null ? 'roundRect' : 'rect')}"><a:avLst>${Object.entries(av).map(([k, v]) => `<a:gd name="${k}" fmla="val ${v}"/>`).join('')}</a:avLst></a:prstGeom>`;
  }
  function bodyX(s) {
    const ins = s.ins || [0.15, 0.05, 0.15, 0.05];
    return `<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="${E(ins[0])}" tIns="${E(ins[1])}" rIns="${E(ins[2])}" bIns="${E(ins[3])}" anchor="${s.va || 'ctr'}" anchorCtr="0" upright="1">${s.fit ? '<a:spAutoFit/>' : '<a:noAutofit/>'}</wps:bodyPr>`;
  }
  function wsp(s, child) {
    const wE = Math.max(E(s.w), 1), hE = Math.max(E(s.h), 1), id = ID++;
    const flip = `${s.flipH ? ' flipH="1"' : ''}${s.flipV ? ' flipV="1"' : ''}`;
    const sp = `<wps:spPr><a:xfrm${flip}><a:off x="${child ? E(s.x) : 0}" y="${child ? E(s.y) : 0}"/><a:ext cx="${wE}" cy="${hE}"/></a:xfrm>${geomX(s, wE, hE)}${fillX(s)}${lnX(s)}</wps:spPr>`;
    const txt = s.txt ? `<wps:txbx><w:txbxContent>${[].concat(s.txt).join('')}</w:txbxContent></wps:txbx>` : '';
    return `<wps:wsp>${child ? `<wps:cNvPr id="${id}" name="${xesc(s.name || '形狀')}"/>` : ''}<wps:cNvSpPr/>${sp}${txt}${bodyX(s)}</wps:wsp>`;
  }
  const GD = (uri, inner) => `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/${uri}">${inner}</a:graphicData></a:graphic>`;
  const wgp = (children, w, h) => `<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${E(w)}" cy="${E(h)}"/><a:chOff x="0" y="0"/><a:chExt cx="${E(w)}" cy="${E(h)}"/></a:xfrm></wpg:grpSpPr>${children.join('')}</wpg:wgp>`;
  const inl = (graphic, w, h, name) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${E(w)}" cy="${E(h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${ID++}" name="${xesc(name)}"/><wp:cNvGraphicFramePr/>${graphic}</wp:inline></w:drawing></w:r>`;
  const anc = (graphic, a, w, h, name) => `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${a.behind ? 251640000 + ID : Z++}" behindDoc="${a.behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${a.relH || 'column'}"><wp:posOffset>${E(a.x || 0)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="${a.relV || 'paragraph'}"><wp:posOffset>${E(a.y || 0)}</wp:posOffset></wp:positionV><wp:extent cx="${E(w)}" cy="${E(h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${ID++}" name="${xesc(name)}"/><wp:cNvGraphicFramePr/>${graphic}</wp:anchor></w:drawing></w:r>`;
  const groupInline = (name, w, h, specs) => inl(GD('wordprocessingGroup', wgp(specs.map((s) => wsp(s, true)), w, h)), w, h, name);
  const groupAnchor = (name, a, w, h, specs) => anc(GD('wordprocessingGroup', wgp(specs.map((s) => wsp(s, true)), w, h)), a, w, h, name);
  const shapeInline = (s) => inl(GD('wordprocessingShape', wsp(s, false)), s.w, s.h, s.name || '形狀');
  const shapeAnchor = (s, a) => anc(GD('wordprocessingShape', wsp(s, false)), { x: s.x, y: s.y, ...a }, s.w, s.h, s.name || '形狀');
  const line = (x1, y1, x2, y2, o) => ({ name: (o && o.name) || '線', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.0003, h: Math.abs(y2 - y1) || 0.0003, g: 'line', ln: (o && o.c) || INK, lw: (o && o.lw) || 1 });

  // ---------------- 茲茲標誌（閃電＋火焰，照 zz-handout zizi.js） ----------------
  const BOLT = [[708, 118], [1052, 118], [771, 786], [824, 786], [908, 586], [1252, 586], [900, 1425], [553, 1425], [751, 958], [353, 958]];
  const FLAME = [['M', 1203, 995], ['C', 1290, 1060, 1313, 1170, 1313, 1275], ['C', 1313, 1355, 1255, 1415, 1180, 1415], ['C', 1105, 1415, 1047, 1355, 1047, 1275],
    ['C', 1047, 1170, 1140, 1110, 1190, 1070], ['C', 1215, 1050, 1210, 1020, 1203, 995], ['Z']];
  const BX = 353, BY = 118, BH = 1307;
  function bolt(x, y, h, o) { const k = h / BH; return { name: '茲茲標誌 閃電', x, y, w: 899 * k, h: 1307 * k, fill: (o && o.c) || GOLD, fa: o && o.fa, path: [...BOLT.map(([px, py], i) => [i ? 'L' : 'M', (px - BX) * k, (py - BY) * k]), ['Z']] }; }
  function flame(x, y, h, o) {
    const k = h / BH, fx = 1047, fy = 995;
    return { name: '茲茲標誌 火焰', x: x + (fx - BX) * k, y: y + (fy - BY) * k, w: 266 * k, h: 420 * k, fill: (o && o.c) || RED, fa: o && o.fa,
      path: FLAME.map((c) => c[0] === 'Z' ? c : [c[0], ...c.slice(1).map((v, i) => (v - (i % 2 ? fy : fx)) * k)]) };
  }
  const logo = (x, y, h) => [bolt(x, y, h), flame(x, y, h)];

  // ---------------- 卷頭共用：閃電斜塊、雙線、填寫欄、得分框 ----------------
  const slab = (x, y, w, h, extra) => ({ name: '閃電斜塊', x, y, w, h, g: 'parallelogram', av: { adj: 24000 }, fill: TH.ac, ...(extra || {}) });
  const rule2 = (y, w) => [line(0, y, w, y, { c: TH.ac, lw: 2.5, name: '粗線' }), line(0, y + 0.13, w, y + 0.13, { c: TH.ac, lw: 0.5, name: '細線' })];
  const field = (x, y, label, w) => [{ name: '欄位名', x, y, w: label.length * 0.42 + 0.3, h: 0.6, ins: [0, 0, 0, 0], va: 'b', txt: P(R(label, { font: F.head, s: 10.5, c: INK })) },
    line(x + label.length * 0.42 + 0.3, y + 0.58, x + label.length * 0.42 + 0.3 + w, y + 0.58, { c: INK, lw: 0.75, name: '填寫線' })];
  const scoreBox = (x, y) => [{ name: '得分框', x, y, w: 2.5, h: 2.5, r: 8, ln: TH.ac, lw: 1.5 },
    { name: '得分籤', x: x + 0.25, y: y - 0.28, w: 1.3, h: 0.56, fill: '#FFFFFF', ins: [0, 0, 0, 0], txt: P(R('得 分', { font: F.head, s: 9, c: INK }), { jc: 'center' }) }];
  // 字太多時縮小字級，放得進框（中文字約 0.0353 cm/pt）
  const fitPt = (text, widthCm, maxPt, minPt) => {
    let n = 0; for (const ch of fixGlyph(text)) n += ch.codePointAt(0) > 0x2e80 ? 1 : 0.55;
    return Math.max(minPt || 9, Math.min(maxPt, n ? widthCm / (n * 0.0353 * 1.05) : maxPt));
  };

  function prequizHead(W, m) {
    const s = [], fx = W - 6.4, tw = Math.min(10.5, fx - 4.95);
    s.push(slab(0, 0, 4.6, 2.75, { fill: '#FFFFFF', ln: TH.ac, lw: 1.75 }));
    s.push(...logo(1.6, 0.3, 1.7));
    s.push({ name: '字標', x: 0.9, y: 2.08, w: 2.8, h: 0.45, ins: [0, 0, 0, 0], txt: P(R('TZU TZU', { font: F.codeB, s: 6.5, c: INK, sp: 3 }), { jc: 'center' }) });
    s.push({ name: '卷種英文', x: 4.75, y: 0.05, w: 9, h: 0.5, ins: [0, 0, 0, 0], txt: P(R('PRE-CLASS QUIZ', { font: F.code, s: 8.5, c: G1, sp: 5 })) });
    const subjPt = fitPt(m.subject + '　' + m.book, tw, 26, 14);
    s.push({ name: '科目冊次', x: 4.75, y: 0.5, w: tw, h: 1.35, ins: [0, 0, 0, 0], va: 'ctr', txt: P([R(m.subject, { font: F.title, s: subjPt, c: INK }), m.book ? R('　' + m.book, { font: F.title, s: subjPt * 20 / 26, c: INK }) : '']) });
    const ls = W < 18 ? 10.5 : 12, labPt = Math.min(ls, fitPt('課前考　' + m.label, tw, ls, 8));
    s.push({ name: '課前考', x: 4.75, y: 1.85, w: tw, h: 0.7, ins: [0, 0, 0, 0], txt: P([R('課前考', { font: F.head, s: labPt, c: '#FFFFFF', hl: TH.ac }), m.label ? R('　' + m.label, { font: F.head, s: labPt, c: INK }) : '']) });
    s.push(...field(fx, 0.25, '班級', 2.0), ...field(fx, 1.15, '座號', 2.0), ...field(fx, 2.05, '姓名', 2.0));
    s.push(...scoreBox(W - 2.6, 0.2));
    s.push(...rule2(3.0, W));
    return P(groupInline('課前考卷頭', W, 3.2, s), { sa: 8 });
  }
  function abkHead(W, m) {
    const s = [], kind = m.variant || 'A', cw = Math.min(12.5, W - 7.1), cs = fitPt(m.chapter, cw, W < 20 ? 18 : 22, 11);
    s.push(slab(0, 0, 3.3, 2.7));
    s.push({ name: '卷種字母', x: 0.2, y: 0.1, w: 2.9, h: 1.8, ins: [0, 0, 0, 0], txt: P(R(kind, { font: F.heavy, s: 50, c: '#FFFFFF' }), { jc: 'center' }) });
    s.push({ name: '卷種字', x: 0.4, y: 1.95, w: 2.5, h: 0.6, ins: [0, 0, 0, 0], txt: P(R(kind + ' 卷', { font: F.head, s: 10, c: '#FFFFFF', sp: 4 }), { jc: 'center' }) });
    s.push(...logo(3.75, 0.1, 1.1));
    s.push({ name: '單位', x: 4.75, y: 0.22, w: 6, h: 0.5, ins: [0, 0, 0, 0], txt: P([R('TZU TZU', { font: F.codeB, s: 8, c: INK, sp: 3 }), R('　茲茲文教　輔導課', { font: F.head, s: 8.5, c: G1 })]) });
    s.push({ name: '章節', x: 3.7, y: 1.1, w: cw, h: 1.1, ins: [0, 0, 0, 0], va: 'ctr', txt: P(R(m.chapter, { font: F.title, s: cs, c: INK })) });
    s.push({ name: '編號', x: 3.75, y: 2.25, w: 9, h: 0.45, ins: [0, 0, 0, 0], txt: P(R(m.code, { font: F.code, s: 9, c: G1, sp: 2 })) });
    s.push(...field(W - 7.7, 2.15, '姓名', 3.3));
    s.push(...scoreBox(W - 2.6, 0.2));
    s.push(...rule2(3.0, W));
    return P(groupInline('ABK 卷頭', W, 3.2, s), { sa: 8 });
  }
  // ABK 浮水印：右下角大大的淡灰閃電（放在頁首，每頁都有）
  const abkWatermark = (pg) => P([groupAnchor('浮水印', { relH: 'page', relV: 'page', x: pg.w - 9.8, y: pg.h - 12.5, behind: true }, 9.5, 11, [bolt(0, 0, 11, { c: TH.ac, fa: 5 }), flame(0, 0, 11, { c: TH.ac, fa: 7 })])]);
  function goldenHead(W, m) {
    const s = [], low = W < 22, fy = low ? 3.25 : 2.4, ry = low ? 4.15 : 3.3;
    s.push(...logo(0.1, 0.1, 2.6));
    s.push({ name: '字標', x: 0, y: 2.75, w: 2.3, h: 0.45, ins: [0, 0, 0, 0], txt: P(R('TZU TZU', { font: F.codeB, s: 7, c: INK, sp: 2 }), { jc: 'center' }) });
    s.push(line(2.75, 0.2, 2.75, 3.1, { c: INK, lw: 1.5, name: '直線' }));
    s.push({ name: '學年學期', x: 3.1, y: 0.05, w: 12, h: 0.6, ins: [0, 0, 0, 0], txt: P(R(`${m.year} 學年度　第 ${m.semester} 學期`, { font: F.head, s: 12, c: G1, sp: 1 })) });
    const tPt = fitPt(m.subject + '　黃金模擬考', W - 10.2, 26, 16);
    s.push({ name: '科目考次', x: 3.1, y: 0.62, w: W - 9.9, h: 1.45, ins: [0, 0, 0, 0], va: 'ctr', txt: P([R(m.subject + '　', { font: F.title, s: tPt, c: INK }), R('黃金模擬考', { font: F.title, s: tPt, c: INK })]) });
    s.push({ name: '版本範圍', x: 3.1, y: 2.1, w: W - 6.2, h: 0.6, ins: [0, 0, 0, 0], txt: P([R('版本', { font: F.head, s: 10, c: '#FFFFFF', hl: TH.ac }), R('　' + m.version + '　　', { font: F.head, s: 10.5, c: INK }), R('範圍', { font: F.head, s: 10, c: '#FFFFFF', hl: TH.ac }), R('　' + m.scope, { font: F.head, s: 10.5, c: INK })]) });
    s.push({ name: 'GOLDEN', x: W - 6.75, y: 0.15, w: 6.7, h: 0.5, ins: [0, 0, 0, 0], txt: P(R('GOLDEN MOCK EXAM', { font: F.code, s: 8, c: G1, sp: 4 }), { jc: 'right' }) });
    s.push({ name: '考次', x: W - 6.75, y: 0.6, w: 6.7, h: 0.9, ins: [0, 0, 0, 0], txt: P(R(m.examTitle, { font: F.title, s: fitPt(m.examTitle, 6.5, 16, 9), c: INK }), { jc: 'right' }) });
    const fx = W - 10.15;
    s.push(...field(fx, fy, '年', 0.9), ...field(fx + 1.65, fy, '班', 0.9), ...field(fx + 3.3, fy, '座號', 1.1), ...field(fx + 5.75, fy, '姓名', 3.3));
    s.push(...rule2(ry, W));
    return P(groupInline('黃金模擬考卷頭', W, ry + 0.2, s), { sa: 8 });
  }
  function mockCover(W, m) {
    const s = [];
    s.push(...logo(0.1, 0.1, 2.2));
    s.push({ name: '字標', x: 0, y: 2.3, w: 2, h: 0.45, ins: [0, 0, 0, 0], txt: P(R('TZU TZU', { font: F.codeB, s: 6.5, c: INK, sp: 2 }), { jc: 'center' }) });
    s.push({ name: '准考證', x: W - 7.5, y: 0.1, w: 4.8, h: 1.2, ins: [0, 0, 0, 0], txt: [P(R('請考生依指示', { font: F.head, s: 10, c: INK }), { jc: 'right' }), P(R('填寫准考證末兩碼', { font: F.head, s: 10, c: INK }), { jc: 'right' })] });
    s.push({ name: '末碼1', x: W - 2.5, y: 0.15, w: 1.15, h: 1.15, ln: INK, lw: 1.25 }, { name: '末碼2', x: W - 1.25, y: 0.15, w: 1.15, h: 1.15, ln: INK, lw: 1.25 });
    s.push(slab(W / 2 - 7.2, 3.3, 14.4, 2.3));
    s.push({ name: '題本名', x: W / 2 - 7, y: 3.35, w: 14, h: 2.2, ins: [0, 0, 0, 0], txt: P(R(m.bookTitle, { font: F.title, s: fitPt(m.bookTitle, 13, 30, 16), c: '#FFFFFF', sp: 4 }), { jc: 'center' }) });
    const subj = [...String(m.subject)].join('　');
    s.push({ name: '科目', x: W / 2 - 7, y: 6.0, w: 14, h: 1.9, ins: [0, 0, 0, 0], txt: P(R(subj, { font: F.title, s: fitPt(subj, 13, 40, 20), c: INK, sp: 6 }), { jc: 'center' }) });
    s.push({ name: '考次', x: W / 2 - 7, y: 8.0, w: 14, h: 0.7, ins: [0, 0, 0, 0], txt: P([m.exam ? R(m.exam, { font: F.head, s: 12, c: '#FFFFFF', hl: TH.ac }) : '', m.scope ? R((m.exam ? '　｜　' : '') + '範圍：' + m.scope, { font: F.head, s: 12, c: INK }) : ''], { jc: 'center' }) });
    s.push(...rule2(9.3, W));
    s.push({ name: '警語', x: 0, y: 9.85, w: W, h: 1.9, r: 10, ln: TH.ac, lw: 1.5, txt: [P(R('請不要翻到次頁！讀完本頁的說明，聽從監試委員的指示開始作答！', { font: F.title, s: 15, c: INK }), { jc: 'center', sa: 4 }), P(R('※ 請先確認你的答案卷、准考證與座位號碼是否一致無誤。', { font: F.head, s: 10, c: G1 }), { jc: 'center' })] });
    return P(groupInline('會考模擬考封面上半', W, 11.9, s), { sa: 12 });
  }
  function mockInstructions(W, m) {
    const h = (t) => P([R('▍', { font: F.head, s: 12, c: TH.ac }), R(t, { font: F.head, s: 12, c: INK })], { sb: 10, sa: 4 });
    const p = (runs) => P(runs, { ind: { l: 0.6 }, ls: 1.35, sa: 2 });
    const t = (x, b) => R(x, { font: F.body, s: 10.5, c: INK, b: !!b });
    let x = h('測驗說明') + p([t(`這是${m.bookTitle}${m.subject}試題本，共有 `), t(`${m.count} 題`, true), t('。作答開始與結束請聽從監試委員的指示。')]);
    x += h('注意事項') + ['選擇題每題都只有一個正確或最佳的答案，答錯不倒扣。', '試題中所附圖形僅作為參考，不一定代表實際大小。', '可利用試題本中空白部分計算，切勿在答案卡上計算。'].map((s, i) => p(t(`${i + 1}.　${s}`))).join('');
    x += h('作答方式') + p(t('請依照題意從選項中選出一個正確或最佳的答案，並用 2B 鉛筆在答案卡上相應的位置畫記，請務必將選項塗黑、塗滿。如果需要修改答案，請使用橡皮擦擦拭乾淨，重新塗黑答案。'));
    x += P([R('每道試題均有著作權，翻印必究', { font: F.head, s: 10, c: '#FFFFFF', hl: TH.ac }), R('\t'), R('TZU TZU EDUCATION', { font: F.codeB, s: 13, c: INK, sp: 5 })], { tabs: [{ v: 'right', pos: W }], sb: 14 });
    return x;
  }
  function answerHead(W, m) {
    const s = [slab(0, 0, 3.0, 1.9), ...logo(1.0, 0.32, 1.25)];
    s.push({ name: '卷種英文', x: 3.3, y: 0.0, w: 10, h: 0.45, ins: [0, 0, 0, 0], txt: P(R('ANSWERS & SOLUTIONS', { font: F.code, s: 8, c: G1, sp: 4 })) });
    const tPt = fitPt(m.title + '　詳解', W - 4, 20, 12);
    s.push({ name: '卷名', x: 3.3, y: 0.42, w: W - 3.4, h: 1.1, ins: [0, 0, 0, 0], va: 'ctr', txt: P([R(m.title + '　', { font: F.title, s: tPt, c: INK }), R('詳解', { font: F.title, s: tPt, c: '#FFFFFF', hl: TH.ac })]) });
    s.push({ name: '範圍', x: 3.3, y: 1.5, w: W - 3.4, h: 0.5, ins: [0, 0, 0, 0], txt: P(R([m.scope, `共 ${m.answers.length} 題`].filter(Boolean).join('　｜　'), { font: F.head, s: 9.5, c: G1 })) });
    s.push(...rule2(2.2, W));
    return P(groupInline('詳解卷頭', W, 2.4, s), { sa: 8 }) + answerKey(W, m.answers);
  }
  // 答案總表：每五題一格，一列五格；題數多就多幾列
  function answerKey(W, answers) {
    const groups = []; for (let i = 0; i < answers.length; i += 5) groups.push(answers.slice(i, i + 5));
    if (!groups.length) return '';
    // 非選擇題（答案超過 4 個字）在總表只放「＊」，答案見下方詳解
    const shortAns = (x) => { const t = String(x || '').replace(/\s+/g, ''); return t.length > 4 ? '＊' : t || '—'; };
    const hasLong = answers.some((x) => shortAns(x) === '＊');
    const cw = TW(W / 5), rows = [];
    for (let r = 0; r < groups.length; r += 5) {
      const cells = [];
      for (let g = r; g < r + 5; g++) {
        const a = groups[g], fill = g % 2 || hex(TH.tint) === 'FFFFFF' ? 'FFFFFF' : hex(TH.tint);
        const lab = a ? `${g * 5 + 1}–${g * 5 + a.length}` : '';
        const txt = a ? a.map(shortAns).join(a.some((x) => shortAns(x).length > 1) ? ' ' : '') : '';
        cells.push(`<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${a ? fill : 'FFFFFF'}"/><w:vAlign w:val="center"/></w:tcPr>${P(R(lab, { font: F.code, s: 7.5, c: G1 }), { jc: 'center' })}${P(R(txt, { font: [F.codeB, FT], s: txt.length > 7 ? 10 : 13, c: INK, sp: txt.length > 7 ? 0 : 3 }), { jc: 'center' })}</w:tc>`);
      }
      rows.push(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${TW(1.1)}" w:hRule="atLeast"/></w:trPr>${cells.join('')}</w:tr>`);
    }
    const b = (t, sz, c) => `<w:${t} w:val="single" w:sz="${sz}" w:space="0" w:color="${c}"/>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${cw * 5}" w:type="dxa"/><w:tblBorders>${b('top', 12, hex(TH.ac))}<w:left w:val="nil"/>${b('bottom', 12, hex(TH.ac))}<w:right w:val="nil"/>${b('insideH', 4, 'BFBFBF')}${b('insideV', 4, 'BFBFBF')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + cw + '"/>'.repeat(5)}</w:tblGrid>${rows.join('')}</w:tbl>` + (hasLong ? P(R('＊ 非選擇題，答案見下方詳解。', { font: F.head, s: 9, c: G1, b: false }), { sb: 3, sa: 6 }) : P('', { sa: 6 }));
  }

  // ---------------- 其他整套風格的卷頭：色帶（科目彩色）、細線（簡潔省墨）、置中（會考仿真） ----------------
  // 五種卷別共用一份卷頭資料：英文小字、主標、標籤、副標、填寫欄、要不要得分欄
  function headInfo(kind, m) {
    if (kind === 'pre') return { en: 'PRE-CLASS QUIZ', title: [m.subject, m.book].filter(Boolean).join('　'), tag: '課前考', sub: m.label || '', fields: ['班級', '座號', '姓名'], score: true };
    if (kind === 'abk') return { en: 'TUTORING · ' + (m.variant || 'A'), title: m.chapter || '', tag: (m.variant || 'A') + ' 卷', sub: m.code || '', fields: ['姓名'], score: true };
    if (kind === 'golden') return { en: 'GOLDEN MOCK EXAM', title: (m.subject || '') + '　黃金模擬考', tag: m.examTitle || '', sub: [`${m.year} 學年度第 ${m.semester} 學期`, m.version ? '版本 ' + m.version : '', m.scope ? '範圍 ' + m.scope : ''].filter(Boolean).join('　'), fields: ['班級', '座號', '姓名'], score: true };
    if (kind === 'mock') return { en: 'MOCK EXAM', title: [m.bookTitle, m.subject].filter(Boolean).join('　'), tag: m.exam || '', sub: m.scope ? '範圍：' + m.scope : '', fields: ['座號', '姓名'], score: false };
    return { en: 'ANSWERS & SOLUTIONS', title: m.title || '', tag: '詳解', sub: [m.scope, `共 ${(m.answers || []).length} 題`].filter(Boolean).join('　｜　'), fields: [], score: false };
  }
  const fieldRuns = (h, c) => [...h.fields, ...(h.score ? ['得分'] : [])].map((f, i) => [i ? R('　', { s: 10.5 }) : '', R(f, { font: F.head, s: 10.5, c }), R(' '.repeat(13), { font: 'Times New Roman', s: 10.5, c, u: 'single' })].join(''));   // 不斷行空白：放在行尾 Word 也不會吃掉底線
  function genericHead(kind, W, m) {
    const h = headInfo(kind, m), s = [];
    if (TH.head === 'band') {
      const tw = W - (h.score ? 5.2 : 2.4);
      const BH = 2.5;
      s.push({ name: '色帶', x: 0, y: 0, w: W, h: BH, fill: TH.ac });
      s.push(bolt(0.4, 0.4, 1.7, { c: '#FFFFFF' }), flame(0.4, 0.4, 1.7, { c: TH.tint }));
      s.push({ name: '卷種英文', x: 2.05, y: 0.2, w: tw, h: 0.45, ins: [0, 0, 0, 0], txt: P(R('TZU TZU · ' + h.en, { font: F.code, s: 8, c: '#FFFFFF', sp: 3 })) });
      s.push({ name: '卷名', x: 2.05, y: 0.62, w: tw, h: 1.05, ins: [0, 0, 0, 0], va: 'ctr', txt: P(R(h.title, { font: F.title, s: fitPt(h.title, tw, 20, 12), c: '#FFFFFF' })) });
      // 標籤＋副標放不下一行（字會小於 8 pt）時，副標移到下方填寫列右邊
      const subDown = !!h.sub && h.fields.length > 0 && fitPt(h.tag + '　　' + h.sub, tw - 0.3, 10, 1) < 9;
      const tagTxt = [h.tag ? R(' ' + h.tag + ' ', { font: F.head, s: 10, c: TH.ac, hl: '#FFFFFF' }) : '', h.sub && !subDown ? R('　' + h.sub, { font: F.head, s: fitPt(h.tag + '　　' + h.sub, tw - 0.3, 10, 6.5), c: '#FFFFFF', b: false }) : ''];
      s.push({ name: '標籤', x: 2.05, y: 1.78, w: tw, h: 0.55, ins: [0, 0, 0, 0], txt: P(tagTxt) });
      if (h.score) s.push({ name: '得分框', x: W - 2.75, y: 0.3, w: 2.45, h: 1.9, r: 12, fill: '#FFFFFF', va: 't', ins: [0, 0.08, 0, 0], txt: P(R('得 分', { font: F.head, s: 9, c: TH.ac }), { jc: 'center' }) });
      const fr = fieldRuns({ ...h, score: false }, INK);
      if (!fr.length) return P(groupInline('彩色卷頭', W, BH, s), { sa: 8 });   // 詳解卷沒有填寫欄，色帶下面直接接答案總表
      s.push({ name: '填寫列', x: 0, y: BH, w: W, h: 0.8, fill: TH.tint, va: 'ctr', ins: [0.45, 0, 0.3, 0], txt: P(subDown ? [...fr, R('	'), R(h.sub, { font: F.head, s: fitPt(h.sub, W - 9.5, 9.5, 6.5), c: G1, b: false })] : fr, subDown ? { tabs: [{ v: 'right', pos: W - 0.75 }] } : {}) });
      return P(groupInline('彩色卷頭', W, BH + 0.8, s), { sa: 8 });
    }
    if (TH.head === 'line') {
      const fr = fieldRuns(h, INK), rw = Math.min(11.5, (h.fields.length + (h.score ? 1 : 0)) * 3.1);
      const tw = W - rw - 0.3;
      // 標籤太長（例如黃金模擬考的考次）就移到副標那一行，主標才不會擠成兩行
      const tagUp = h.tag && fitPt(h.title + '　' + h.tag, tw, 18, 9) >= 14;
      const tPt = fitPt(tagUp ? h.title + '　' + h.tag : h.title, tw, 18, 11);
      s.push({ name: '卷名', x: 0, y: 0, w: tw, h: 1.0, ins: [0, 0, 0, 0], va: 'b', txt: P([R(h.title, { font: F.title, s: tPt, c: INK }), tagUp ? R('　' + h.tag, { font: F.title, s: tPt, c: INK }) : '']) });
      const subTxt = ['茲茲文教', tagUp ? '' : h.tag, h.sub].filter(Boolean).join('　');
      s.push({ name: '副標', x: 0, y: 1.08, w: W, h: 0.5, ins: [0, 0, 0, 0], txt: P(R(subTxt, { font: F.head, s: fitPt(subTxt, W, 9.5, 6.5), c: G1, b: false })) });   // 副標整行寬，填寫欄移到主標右邊
      if (fr.length) s.push({ name: '填寫欄', x: W - rw, y: 0.3, w: rw, h: 0.7, ins: [0, 0, 0, 0], va: 'b', txt: P(fr, { jc: 'right' }) });
      s.push(line(0, 1.72, W, 1.72, { c: TH.ac, lw: 1, name: '底線' }));
      return P(groupInline('簡潔卷頭', W, 1.8, s), { sa: 8 });
    }
    // cap：仿會考題本，置中標題＋方框填寫欄
    s.push({ name: '單位', x: 0, y: 0, w: W, h: 0.45, ins: [0, 0, 0, 0], txt: P(R('茲茲文教　｜　' + h.en, { font: F.code, s: 8.5, c: G1, sp: 1 }), { jc: 'center' }) });
    s.push({ name: '卷名', x: 0, y: 0.45, w: W, h: 1.1, ins: [0, 0, 0, 0], va: 'ctr', txt: P(R(h.title, { font: F.title, s: fitPt(h.title, W - 2, 22, 12), c: INK }), { jc: 'center' }) });
    const sub = [h.tag, h.sub].filter(Boolean).join('　｜　');
    s.push({ name: '副標', x: 0, y: 1.55, w: W, h: 0.55, ins: [0, 0, 0, 0], txt: P(R(sub || ' ', { font: F.head, s: 11, c: INK }), { jc: 'center' }) });
    const fr = fieldRuns(h, INK);
    if (fr.length) {
      s.push({ name: '填寫框', x: 0, y: 2.3, w: W, h: 0.95, ln: TH.ac, lw: 1, va: 'ctr', ins: [0.3, 0, 0.3, 0], txt: P(fr, { jc: 'center' }) });
      return P(groupInline('會考卷頭', W, 3.3, s), { sa: 8 });
    }
    s.push(line(0, 2.25, W, 2.25, { c: TH.ac, lw: 1, name: '底線' }));
    return P(groupInline('會考卷頭', W, 2.35, s), { sa: 8 });
  }

  // ---------------- 頁首頁尾（第二頁起有頁首） ----------------
  const runHead = (left, right, w) => P([R('TZU TZU', { font: F.codeB, s: 7.5, c: G1, sp: 2 }), R('　茲茲文教　｜　' + left, { font: F.head, s: 8, c: G1, b: false }), R('\t'), R(right, { font: [F.code, FT], s: 8, c: G1, sp: 1 })],
    { tabs: [{ v: 'right', pos: w }], bdr: `<w:bottom w:val="single" w:sz="4" w:space="3" w:color="${TH.ac === INK ? '8C8C8C' : hex(TH.ac)}"/>`, sa: 0 });
  const foot = (subject, w) => P([R('TZU TZU', { font: F.codeB, s: 7.5, c: G2, sp: 2 }), R('\t'), R('— ', { font: F.code, s: 9, c: G1 }), '<w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:rFonts w:ascii="${JF.semi}" w:hAnsi="${JF.semi}" w:eastAsia="${JF.semi}"/><w:color w:val="1A1A1A"/><w:sz w:val="20"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>', R(' —', { font: F.code, s: 9, c: G1 }), R('\t'), R(subject, { font: F.head, s: 8, c: G2, b: false })],
    { tabs: [{ v: 'center', pos: w / 2 }, { v: 'right', pos: w }], bdr: '<w:top w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/>' });
  function sect(pg, o) {
    o = o || {};
    const ref = (t, k, id) => (id ? `<w:${k}Reference w:type="${t}" r:id="rId_${id}"/>` : '');
    return `<w:sectPr>${ref('default', 'header', o.hdr)}${ref('first', 'header', o.hdrFirst)}${ref('default', 'footer', o.ftr)}${ref('first', 'footer', o.ftrFirst)}${o.cont ? '<w:type w:val="continuous"/>' : ''}<w:pgSz w:w="${TW(pg.w)}" w:h="${TW(pg.h)}"/><w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="284" w:footer="284" w:gutter="0"/><w:cols w:num="${o.cols || 1}" w:space="709"${(o.cols || 1) > 1 ? ' w:sep="1"' : ''}/>${o.hdrFirst ? '<w:titlePg/>' : ''}</w:sectPr>`;
  }

  // ---------------- 題目區：大題、選擇題、非選、題組框、圖片 ----------------
  // 大題：左粗黑框＋淡灰底＋右側配分（「一、」由 Word 自動編號）
  const secHead = (name, score) => P([R(name, { font: F.head, s: 13, c: TH.sec === 'tint' ? TH.ac : INK }), R('\t'), R(score || '／每題＿＿分，共＿＿分', { font: ['Times New Roman', JF.reg], s: 10, c: G1 })], { style: 'ZXSec' });
  // 選擇題選項排版：照茲茲課前考（14國七生物課前考）——題幹從 960 起、定位點 3000/5280/7560。
  // 估字寬（12 pt：中文 240 twips、英數約 120），決定一行四個／兩個／一個。
  function visLen(text) {
    const extra = 0;
    // 公式在 Word 裡先是 $…$ 原始碼，要等 MathType 轉換才變短：用原始碼長度估，排版才不會擠爆
    const plain = String(text).replace(/[-]/g, '');
    let n = 0; for (const ch of plain) n += ch.codePointAt(0) > 0x2e80 ? 240 : 125;
    return n + extra * 240;
  }
  const Q_LEFT = 960, Q_TABS = [3000, 5280, 7560];
  function optionLines(opts, textW) {
    const ws = opts.map((o) => visLen(o) + 120);    // 每個選項後面至少留半個字的間隔
    const max = Math.max.apply(null, ws);
    const can4 = textW >= 15.5 * 567 && opts.length !== 2 && opts.length !== 5 && max <= Q_TABS[0] - Q_LEFT + 60 && max <= textW - Q_TABS[2];
    const mid = textW >= 15.5 * 567 ? Q_TABS[1] : Q_TABS[0];   // 兩個一行：第二個選項的起點（窄欄只有 3000 可用）
    const can2 = max <= mid - Q_LEFT && max <= textW - mid;
    const cols = can4 ? 4 : can2 ? 2 : 1;
    const lines = [];
    for (let i = 0; i < opts.length; i += cols) {
      const row = opts.slice(i, i + cols);
      // 兩個一行時，該題段落只留 5280 一個定位點（見 choiceQuestion），一個 Tab 一定停在 5280
      lines.push(row.join('\t'));
    }
    return { cols, lines, mid };
  }
  // 教用版答案：紅字文字方塊疊在題號「(　　)」上；整個 run 設隱藏文字（Word 關掉 ¶ 就是學生卷）
  function answerBox(ans, qno) {
    const id = ID++, digits = String(qno).length;
    // 題號標籤「N.(　　)」12 pt、靠右對齊在 900 twips（Tab 後題幹從 960 起）：不論幾位數，括號中心都在同一處
    const centerTw = Q_LABEL_RIGHT - 80 - 240 + ANSBOX_DX;
    const w = 300000, h = 228600, a = xesc(fixGlyph(ans));
    const offx = Math.round(centerTw * 635 - w / 2);
    return '<w:r><w:rPr><w:noProof/><w:vanish/></w:rPr><w:drawing>'
      + `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251680000" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>`
      + `<wp:positionH relativeFrom="column"><wp:posOffset>${offx}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${ANSBOX_Y}</wp:posOffset></wp:positionV>`
      + `<wp:extent cx="${w}" cy="${h}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="答案${qno}"/><wp:cNvGraphicFramePr/>`
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/>'
      + `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>`
      + '<wps:txbx><w:txbxContent><w:p><w:pPr><w:snapToGrid w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>'
      + `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="${HK}"/><w:b/><w:color w:val="${hex(ANS)}"/><w:sz w:val="${a.length > 2 ? 18 : 24}"/><w:szCs w:val="24"/><w:vanish/></w:rPr><w:t xml:space="preserve">${a}</w:t></w:r>`
      + '</w:p></w:txbxContent></wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" anchorCtr="1"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }
  let ANSBOX_Y = 0;   // 由 buildDocx 依段前距離設定（EMU）
  const Q_LABEL_RIGHT = 900, ANSBOX_DX = 150;   // 題號標籤右緣（twips）；ANSBOX_DX＝Word 實測微調

  // 圖片（題內、題組內）：獨立一段、置中
  function picRun(img, ctx) {
    const rid = ctx.addMedia(img);
    const id = ID++, cx = Math.round(img.cx), cy = Math.round(img.cy);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="圖片 ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="圖片 ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  const qfont = (o) => ({ font: F.body, s: 12, c: INK, ...(o || {}) });

  // 題目出處：自成一行、靠右、小灰字（匯出視窗勾「顯示題目出處」才有）
  const srcLine = (src, o) => P(R('［' + src + '］', { font: F.body, s: 8, c: '#808080' }), { jc: 'right', sb: 0, sa: 3, ...(o || {}) });
  function choiceQuestion(it, ctx) {
    const lay = it.options && it.options.length >= 2 ? optionLines(it.options, ctx.textW) : { cols: 0, lines: [] };
    let runs = RT(it.stem, qfont());
    const own = lay.cols === 1;   // 一行一個：每個選項自成一段，長選項換行時對齊在「(A)」後面
    if (!own) lay.lines.forEach((ln) => { runs += '<w:r><w:br/></w:r>' + RT(ln, qfont()); });
    if (ctx.teacher && it.ans) runs = answerBox(it.ans, it.no) + runs;
    const more = own || !!(it.imgs && it.imgs.length) || !!it.src;
    const two = lay.cols === 2 && lay.mid === Q_TABS[1] ? { tabs: [{ v: 'clear', tw: Q_TABS[0] }, { v: 'clear', tw: Q_TABS[2] }] } : {};
    let x = P(runs, { style: 'ZXQ', kl: true, kn: more, ...two, ...(own ? { sb: 3.6, sa: 0 } : {}) });
    if (own) lay.lines.forEach((ln, i) => {
      x += P(RT(ln, qfont()), { indTw: { l: Q_LEFT + 345, h: 345 }, tabs: Q_TABS.map((tw) => ({ tw })), sb: 0, sa: i === lay.lines.length - 1 ? 3.6 : 0, kl: true, kn: i < lay.lines.length - 1 || !!(it.imgs && it.imgs.length) || !!it.src });
    });
    // 同一題的圖排在同一行、置中（放不下 Word 會自動換行）
    if ((it.imgs || []).length) x += P((it.imgs || []).map((img) => picRun(img, ctx)).join(R('　')), { jc: 'center', indTw: { l: Q_LEFT }, sa: 3, kn: !!it.src });
    if (it.src) x += srcLine(it.src);
    if (ctx.teacher && it.sol && ctx.showSol) x += solutionNote(it.sol);
    return x;
  }
  // 非選擇題：題號「N.」＋題幹；「＿＿」作答處改成【　　　　】；教用版在下面加一行隱藏的紅字答案
  function openQuestion(it, ctx) {
    const stem = String(it.stem).replace(/[＿_]{2,}/g, '【　　　　】');
    let x = P([R(it.no + '.', qfont()), R('\t', qfont()), RT(stem, qfont())], { indTw: { l: Q_LEFT, h: Q_LEFT - 60 }, tabs: [{ tw: Q_LEFT }], sb: 3.6, sa: 3.6, kl: true, kn: true });
    if ((it.imgs || []).length) x += P((it.imgs || []).map((img) => picRun(img, ctx)).join(R('　')), { jc: 'center', indTw: { l: Q_LEFT }, sa: 3, kn: true });
    if (it.src) x += srcLine(it.src, { kn: true });
    if (ctx.teacher && it.ans) x += P([R('答：', qfont({ c: ANS, b: true, vanish: true })), RT(it.ans, qfont({ c: ANS, vanish: true }))], { indTw: { l: Q_LEFT }, sa: 3 });
    x += P('', { sa: it.lines ? it.lines * 12 : 24 });   // 作答空間
    return x;
  }
  function solutionNote(sol) {
    return P([R('詳解　', { font: F.head, s: 10, c: ANS, vanish: true }), RT(sol, { font: F.body, s: 10, c: ANS, vanish: true })], { indTw: { l: Q_LEFT }, sa: 3, ls: 1.2 });
  }
  // 題組框：圓角細黑框、左上「題組」小黑籤；太長（超過約半頁）時改成整段加框的段落，才能跨頁
  function passageBlock(ps, W, ctx) {
    const head = [R('◎ ', { font: F.body, s: 10, c: INK }), R(`閱讀下文，回答第 ${ps.range} 題：`, { font: F.head, s: 10, c: INK })];
    const paras = String(ps.text || '').split('\n').filter((s) => s.trim());
    const innerW = W - 0.95;
    let estH = 0.85 + 0.62;
    const perLine = Math.max(8, Math.floor(innerW / 0.3528 / 1.02));
    for (const p of paras) estH += Math.max(1, Math.ceil(visLen(p) / 240 * 1.2 / perLine)) * 0.6 + 0.1;
    { let rowW = 0, rowH = 0; for (const img of ps.imgs || []) { const w = img.cx / 360000 + 0.4, h = img.cy / 360000; if (rowW + w > innerW && rowW) { estH += rowH + 0.25; rowW = 0; rowH = 0; } rowW += w; rowH = Math.max(rowH, h); } if (rowH) estH += rowH + 0.25; }
    if (estH > ctx.pg.h * 0.55) {
      const bc = hex(TH.ac), bz = TH.box === 'thin' ? 4 : 6;
      const bd = ['top', 'left', 'bottom', 'right'].map((k) => `<w:${k} w:val="single" w:sz="${bz}" w:space="${k === 'top' || k === 'bottom' ? 4 : 6}" w:color="${bc}"/>`).join('');
      const o = { bdr: bd, ind: { l: 0.2, r: 0.2 }, ls: 1.3, sa: 0, ...(TH.box === 'tint' ? { shd: TH.tint } : {}) };
      const tag = TH.box === 'thin' ? R('【題組】', { font: F.head, s: 9.5, c: TH.ac }) : R('題組', { font: F.head, s: 9.5, c: '#FFFFFF', hl: TH.ac });
      let x = P([tag, R('　'), ...head], { ...o, sb: 10 });
      paras.forEach((p) => { x += P(RT(p, { font: F.body, s: 10, c: INK }), o); });
      if ((ps.imgs || []).length) x += P((ps.imgs || []).map((img) => picRun(img, ctx)).join(R('　')), { ...o, jc: 'center' });
      if (ps.src) x += P(R('［' + ps.src + '］', { font: F.body, s: 8, c: '#808080' }), { ...o, jc: 'right' });
      return x + P('', { sa: 4 });
    }
    const txt = [P(head, { sa: 3 })];
    paras.forEach((p) => txt.push(P(RT(p, { font: F.body, s: 10, c: INK }), { ls: 1.3, sa: 3 })));
    if ((ps.imgs || []).length) txt.push(P((ps.imgs || []).map((img) => picRun(img, ctx)).join(R('　')), { jc: 'center', sa: 3 }));
    if (ps.src) { txt.push(srcLine(ps.src, { sa: 0 })); estH += 0.45; }
    const spacer = P(R('', { s: 14 }), { sb: 0, sa: 0, kn: true });
    const bx = TH.box;
    const tagShape = bx === 'thin' ? { g: 'rect', fill: '#FFFFFF', ln: TH.ac, lw: 0.5, c: TH.ac } : bx === 'square' ? { g: 'rect', fill: TH.ac, c: '#FFFFFF' } : bx === 'tint' ? { r: 25, fill: TH.ac, c: '#FFFFFF' } : { g: 'parallelogram', av: { adj: 22000 }, fill: TH.ac, c: '#FFFFFF' };
    const { c: tagC, ...tagGeo } = tagShape;
    const boxShape = { name: '題組框', w: W, h: estH, ln: TH.ac, lw: bx === 'thin' ? 0.5 : bx === 'square' ? 1 : 0.75, fit: true, va: 't', ins: [0.55, 0.6, 0.4, 0.25], txt,
      ...(bx === 'square' || bx === 'thin' ? { g: 'rect' } : { r: 3 }), ...(bx === 'tint' ? { fill: TH.tint } : {}) };
    return spacer + P([shapeAnchor({ name: '題組籤', x: 0.35, y: 0.26, w: 1.5, h: 0.6, ...tagGeo, ins: [0, 0, 0, 0], txt: P(R('題組', { font: F.head, s: 9.5, c: tagC }), { jc: 'center' }), y: -0.3 }, { relV: 'paragraph' }),
      shapeInline(boxShape)], { sb: 0, sa: 6, kn: true });
  }

  // ---------------- 解析卷：照使用者規則＝12 pt、單行、單一連續無框線四欄表格（題號｜【答案】/【詳解】｜選項｜說明） ----------------
  function solutionTable(questions, W) {
    const tw = TW(W), cNum = 400, cLab = 1250, cLet = 520, cTxt = tw - cNum - cLab - cLet;
    const none = '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>';
    const para = (runs, o) => P(runs, { sa: 0, ls: 1, kl: true, kn: o && o.kn, jc: o && o.jc });
    const cell = (w, body, o) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o && o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o && o.vm ? `<w:vMerge${o.vm === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${none}${o && o.nowrap ? '<w:noWrap/>' : ''}<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="${o && o.tight ? 10 : 60}" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="${o && o.tight ? 10 : 60}" w:type="dxa"/></w:tcMar><w:vAlign w:val="top"/></w:tcPr>${body}</w:tc>`;
    const t = (s, b) => RT(s, { font: F.body, s: 12, c: INK, b: !!b });
    const rows = [];
    questions.forEach((q, qi) => {
      const ex = [];
      if (q.detail) ex.push({ label: '【詳解】', text: q.detail });
      q.options.forEach((o, i) => ex.push({ label: !q.detail && i === 0 ? '【詳解】' : '', option: `(${o.label})`, text: o.text }));
      const kn = ex.length > 0;
      const top = qi ? '' : '';
      rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${top}${cell(cNum, para(t(String(q.no), true), { kn, jc: 'center' }), { vm: 'restart', tight: true, nowrap: true })}${cell(cLab, para(t('【答案】', true), { kn }), { tight: true, nowrap: true })}${cell(cLet + cTxt, para(t(q.answer, true), { kn }), { span: 2 })}</w:tr>`);
      ex.forEach((r, i) => {
        const k = i < ex.length - 1;
        const tail = r.option ? cell(cLet, para(t(r.option), { kn: k, jc: 'center' }), { tight: true, nowrap: true }) + cell(cTxt, para(t(r.text), { kn: k })) : cell(cLet + cTxt, para(t(r.text), { kn: k }), { span: 2 });
        rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(cNum, para(''), { vm: 'cont' })}${cell(cLab, para(r.label ? t(r.label, true) : '', { kn: k }), { tight: true, nowrap: true })}${tail}</w:tr>`);
      });
    });
    if (!rows.length) return '';
    return `<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${cNum}"/><w:gridCol w:w="${cLab}"/><w:gridCol w:w="${cLet}"/><w:gridCol w:w="${cTxt}"/></w:tblGrid>${rows.join('')}</w:tbl>` + P('');
  }

  // ---------------- Word 樣式與自動編號（照 zz-handout lib/exam.js） ----------------
  // 大題外觀：bar＝左粗條＋淡底（正式／紅金）；tint＝主色左條＋主色淡底、主色字；rule＝只有底線；plain＝只有字
  function secBorder() {
    const a = hex(TH.ac);
    if (TH.sec === 'rule') return `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${a}"/></w:pBdr>`;
    if (TH.sec === 'plain') return '';
    const bottom = TH.sec === 'bar' ? `<w:bottom w:val="single" w:sz="4" w:space="3" w:color="${TH.ac === INK ? '8C8C8C' : a}"/>` : '';
    return `<w:pBdr><w:left w:val="single" w:sz="36" w:space="6" w:color="${a}"/>${bottom}</w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${hex(TH.tint)}"/>`;
  }
  function stylesXml(W) {
    const rf = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="${HK}" w:cs="Times New Roman"/>`;
    const st = (id, name, next, ppr, rpr) => `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="a"/><w:next w:val="${next}"/><w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
    const q4 = Q_TABS.map((k) => `<w:tab w:val="left" w:pos="${k}"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${rf}<w:color w:val="1A1A1A"/><w:kern w:val="2"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:eastAsia="zh-TW" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl w:val="0"/><w:snapToGrid w:val="0"/></w:pPr></w:style>
<w:style w:type="character" w:default="1" w:styleId="a0"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="table" w:default="1" w:styleId="a1"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
${st('ZXSec', '茲茲大題', 'ZXQ', `<w:keepNext/><w:numPr><w:numId w:val="1"/></w:numPr>${secBorder()}<w:tabs><w:tab w:val="right" w:pos="${TW(W - 0.2)}"/></w:tabs><w:snapToGrid w:val="0"/><w:spacing w:before="200" w:after="160" w:line="240" w:lineRule="auto"/>`,
      `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="${JF.bold}" w:cs="Times New Roman"/><w:color w:val="1A1A1A"/><w:sz w:val="26"/><w:szCs w:val="26"/>`)}
${st('ZXQ', '茲茲題目', 'ZXQ', `<w:numPr><w:numId w:val="2"/></w:numPr><w:tabs>${q4}</w:tabs><w:adjustRightInd w:val="0"/><w:snapToGrid w:val="0"/><w:spacing w:before="72" w:after="72" w:line="240" w:lineRule="auto"/>`, `${rf}<w:color w:val="1A1A1A"/><w:sz w:val="24"/><w:szCs w:val="24"/>`)}
</w:styles>`;
  }
  const NUMBERING = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:nsid w:val="5A5A0001"/><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="taiwaneseCountingThousand"/><w:suff w:val="nothing"/><w:lvlText w:val="%1、"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${TW(0.3)}" w:hanging="0"/></w:pPr><w:rPr><w:rFonts w:ascii="${JF.bold}" w:hAnsi="${JF.bold}" w:eastAsia="${JF.bold}"/><w:color w:val="${TH.sec === 'tint' ? hex(TH.ac) : '1A1A1A'}"/><w:sz w:val="26"/></w:rPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:nsid w:val="5A5A0002"/><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.(　　)"/><w:lvlJc w:val="right"/><w:pPr><w:ind w:left="960" w:hanging="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="${HK}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
  const NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14"';
  const settingsXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="480"/><w:characterSpacingControl w:val="compressPunctuation"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="en-US" w:eastAsia="zh-TW"/><w:docVars><w:docVar w:name="zz.kind" w:val="exam"/></w:docVars></w:settings>`;

  // ---------------- 打包 ----------------
  /* spec = {
   *   kind: 'pre'|'abk'|'golden'|'mock'|'solution', paper: 'A4'|'B4', teacher: bool, showSol: bool,
   *   meta: {...卷頭文字},  running: {left, right}, footer: '自然·第三冊', title: '檔案標題',
   *   sections: [{title:'單選題', score:'每題 2 分，共 20 分', items:[
   *     {no, kind:'choice'|'open', stem, options:['(A)…',…], ans, sol, imgs:[{bytes:Uint8Array, ext:'png'|'jpeg', cx, cy}],
   *      passage:{range:'4～5', text, imgs:[…]} }]}],
   *   solutions: [{no, answer, detail, options:[{label,text}]}]   // kind=solution
   * } */
  async function buildDocx(spec) {
    const JSZip = window.JSZip;
    if (!JSZip) throw new Error('Word 打包套件（JSZip）尚未載入');
    ID = 2000; Z = 251660000;
    TH = pickStyle(spec.style, spec.field);
    const pg = spec.paper === 'B4' ? { w: 25.7, h: 36.4 } : { w: 21.0, h: 29.7 };
    const W = pg.w - 2;
    const kind = spec.kind;
    const cols = kind === 'abk' ? 2 : 1;
    const colW = cols === 2 ? (W - 1.25) / 2 : W;
    const media = [];
    const ctx = { pg, textW: TW(colW), teacher: !!spec.teacher, showSol: !!spec.showSol,
      addMedia(img) { const n = media.length + 1; media.push({ name: `image${n}.${img.ext === 'jpeg' ? 'jpeg' : 'png'}`, bytes: img.bytes }); return 'rIdImg' + n; } };
    // 題號「(　　)」在 12 pt 題目第一行；答案方塊放在段前 3.6 pt 之後、略往上置中
    ANSBOX_Y = Math.round(72 * 635 - 20000 - 48900);   // Word 實測（華康中圓體 12 pt 行高）：紅字與括號同高
    const m = spec.meta || {};
    const HF = { hdr: 'header1', hdrFirst: 'header2', ftr: 'footer1', ftrFirst: 'footer1' };
    const headers = {
      header1: (kind === 'abk' && TH.wm ? abkWatermark(pg) : '') + runHead(spec.running.left, spec.running.right, W),
      header2: kind === 'abk' && TH.wm ? abkWatermark(pg) : P(''),
      footer1: foot(spec.footer || '', W),
    };
    let body = '';
    let qbody = '';
    if (kind === 'solution') {
      qbody = solutionTable(spec.solutions || [], W);
    } else {
      for (const sec of spec.sections || []) {
        qbody += secHead(sec.title, sec.score ? '／' + sec.score : '');
        for (const it of sec.items) {
          if (it.passage) qbody += passageBlock(it.passage, colW, ctx);
          qbody += it.kind === 'open' ? openQuestion(it, ctx) : choiceQuestion(it, ctx);
        }
      }
    }
    const gh = TH.head === 'zz' ? '' : genericHead(kind, W, m);   // 茲茲正式版／紅金用各卷別原本的閃電卷頭
    if (kind === 'pre') body = (gh || prequizHead(W, m)) + qbody + sect(pg, HF);
    else if (kind === 'golden') body = (gh || goldenHead(W, m)) + qbody + sect(pg, HF);
    else if (kind === 'abk') body = (gh || abkHead(W, m)) + P('', { sect: sect(pg, HF), sa: 0 }) + qbody + sect(pg, { cols: 2, cont: true, ...HF });
    else if (kind === 'mock') body = (gh || mockCover(W, m)) + mockInstructions(W, m) + P('', { sect: sect(pg, {}), sa: 0 }) + qbody + sect(pg, { hdr: 'header1', ftr: 'footer1' });
    else body = (gh ? gh + answerKey(W, m.answers || []) : answerHead(W, m)) + qbody + sect(pg, { hdr: 'header1', ftr: 'footer1' });

    const zip = new JSZip();
    const hdrIds = Object.keys(headers);
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${hdrIds.map((h) => `<Override PartName="/word/${h}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${h.startsWith('footer') ? 'footer' : 'header'}+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(spec.title || '')}</dc:title><dc:creator>茲茲文教</dc:creator></cp:coreProperties>`);
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${hdrIds.map((h) => `<Relationship Id="rId_${h}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${h.startsWith('footer') ? 'footer' : 'header'}" Target="${h}.xml"/>`).join('')}${media.map((x, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${x.name}"/>`).join('')}</Relationships>`);
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}</w:body></w:document>`);
    for (const h of hdrIds) {
      const tag = h.startsWith('footer') ? 'ftr' : 'hdr';
      zip.file(`word/${h}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${tag} ${NS}>${headers[h]}</w:${tag}>`);
    }
    zip.file('word/styles.xml', stylesXml(colW));
    zip.file('word/settings.xml', settingsXml());
    zip.file('word/numbering.xml', NUMBERING());
    for (const x of media) zip.file('word/media/' + x.name, x.bytes);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  window.ZZExam = { buildDocx, optionLines, visLen, fixGlyph, STYLES };
})();
