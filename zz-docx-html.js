/* 茲茲考卷 Word → HTML 預覽渲染器
 * 直接讀 ZZExam.buildParts(spec) 產生 Word 時用的那份 XML（內文、樣式、編號、頁首頁尾、圖片），
 * 在瀏覽器畫成一張張固定尺寸的紙。預覽與 Word 用同一份資料，所以版面一致；只是用瀏覽器排字，
 * 換行與行高會因字型不同有些微差距（字型有裝華康中圓體、金萱那提時最接近）。
 * 入口：ZZDocHtml.render(parts, hostEl, { showHidden:false }) → { pages }
 */
(function () {
  'use strict';
  const PX_CM = 96 / 2.54, PX_TW = 96 / 1440, PX_PT = 96 / 72, PX_EMU = 96 / 914400;
  const tw = (v) => (+v || 0) * PX_TW;
  const kids = (el, n) => (el ? [...el.children].filter((c) => c.localName === n) : []);
  const kid = (el, n) => kids(el, n)[0] || null;
  const wa = (el, n) => (el ? el.getAttribute('w:' + n) : null);
  const hex = (c) => (c && c !== 'auto' ? '#' + String(c).replace('#', '') : '');

  // ---------------- CSS ----------------
  const CSS = `
.zzdoc{--zzs:1;font-family:'Times New Roman','HuaKangTNR',serif;color:#1a1a1a}
.zzdoc *{box-sizing:border-box}
.zzpg{position:relative;background:#fff;margin:0 auto 18px;box-shadow:0 2px 14px rgba(0,0,0,.18);overflow:hidden;flex:none}
.zzcol{position:absolute;overflow:visible}
.zzp{position:relative;white-space:pre-wrap;word-break:normal;overflow-wrap:break-word;line-height:normal}
.zzp .ztab{display:inline-block;height:1px;width:0;vertical-align:baseline}
.zzp .zlbl{position:absolute;left:0;white-space:nowrap;text-align:right}
.zzshape{position:absolute}
.zzshape svg{position:absolute;left:0;top:0;overflow:visible}
.zzshape .ztx{position:absolute;display:flex;flex-direction:column}
.zzgrp{position:relative;display:inline-block;vertical-align:baseline}
.zzinl{position:relative;display:inline-block;vertical-align:baseline}
.zzpic{display:inline-block;vertical-align:baseline}
.zzdoc table{border-collapse:collapse;table-layout:fixed}
.zzdoc td{vertical-align:top;padding:0}
.zzmeasure{position:absolute;left:-99999px;top:0;visibility:hidden}
`;
  function ensureCss() {
    if (document.getElementById('zzdoc-css')) return;
    const s = document.createElement('style'); s.id = 'zzdoc-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---------------- 字型與文字屬性 ----------------
  const FALLBACK = "'HuaKangTNR','DFPYuanMedium-B5','PingFang TC','Microsoft JhengHei','Noto Sans TC','WenQuanYi Zen Hei',sans-serif";
  function famCss(ascii, east) {
    const q = (n) => (n ? `'${String(n).replace(/'/g, '')}'` : '');
    const hk = /華康|DFP/.test(east || '') || /華康|DFP/.test(ascii || '');
    const list = [];
    if (ascii && !/華康|DFP/.test(ascii)) list.push(q(ascii));
    if (east && east !== ascii) list.push(q(east));
    if (hk) list.unshift("'HuaKangTNR'");
    return (list.length ? list.join(',') + ',' : '') + FALLBACK;
  }
  function rprOf(el) {
    const o = {};
    if (!el) return o;
    const rf = kid(el, 'rFonts'); if (rf) { o.ascii = wa(rf, 'ascii'); o.east = wa(rf, 'eastAsia'); }
    const c = kid(el, 'color'); if (c) o.color = hex(wa(c, 'val'));
    const sz = kid(el, 'sz'); if (sz) o.sz = +wa(sz, 'val') / 2;
    const sp = kid(el, 'spacing'); if (sp) o.sp = +wa(sp, 'val') / 20;
    const sh = kid(el, 'shd'); if (sh) o.hl = hex(wa(sh, 'fill'));
    const u = kid(el, 'u'); if (u) o.u = wa(u, 'val');
    if (kid(el, 'vanish')) o.vanish = true;
    if (kid(el, 'b')) o.b = true;
    return o;
  }
  const mergeR = (a, b) => Object.assign({}, a, Object.fromEntries(Object.entries(b || {}).filter(([, v]) => v !== undefined)));
  function rStyle(o) {
    let s = `font-family:${famCss(o.ascii, o.east)};font-size:${(o.sz || 10) * PX_PT}px;`;
    if (o.color) s += `color:${o.color};`;
    if (o.sp) s += `letter-spacing:${o.sp * PX_PT}px;`;
    if (o.hl) s += `background:${o.hl};`;
    if (o.b) s += 'font-weight:bold;';
    if (o.u) s += `text-decoration:underline;${o.u === 'double' ? 'text-decoration-style:double;' : ''}`;
    return s;
  }

  // ---------------- 樣式、編號 ----------------
  function parse(xml) { return new DOMParser().parseFromString(xml, 'application/xml').documentElement; }
  function loadStyles(xml) {
    const root = parse(xml), st = { def: {}, para: {} };
    const dd = kid(kid(root, 'docDefaults'), 'rPrDefault'); st.def = rprOf(kid(dd, 'rPr'));
    kids(root, 'style').forEach((s) => { st.para[wa(s, 'styleId')] = { ppr: kid(s, 'pPr'), r: rprOf(kid(s, 'rPr')) }; });
    return st;
  }
  const CH = '零一二三四五六七八九';
  function cnNum(n) {
    if (n < 10) return CH[n];
    if (n < 20) return '十' + (n % 10 ? CH[n % 10] : '');
    if (n < 100) return CH[Math.floor(n / 10)] + '十' + (n % 10 ? CH[n % 10] : '');
    return String(n);
  }
  function loadNumbering(xml) {
    const root = parse(xml), abs = {}, nums = {};
    kids(root, 'abstractNum').forEach((a) => {
      const l = kid(a, 'lvl'), ind = kid(kid(l, 'pPr'), 'ind');
      abs[wa(a, 'abstractNumId')] = { fmt: wa(kid(l, 'numFmt'), 'val'), text: wa(kid(l, 'lvlText'), 'val'), jc: wa(kid(l, 'lvlJc'), 'val'),
        suff: kid(l, 'suff') ? wa(kid(l, 'suff'), 'val') : 'tab', left: ind ? +wa(ind, 'left') : 0, hang: ind ? +(wa(ind, 'hanging') || 0) : 0, r: rprOf(kid(l, 'rPr')) };
    });
    kids(root, 'num').forEach((n) => { nums[wa(n, 'numId')] = abs[wa(kid(n, 'abstractNumId'), 'val')]; });
    return nums;
  }

  // ---------------- 段落屬性 ----------------
  function pprOf(pEl, S) {
    const o = { sb: 0, sa: 0, line: 1, left: 0, right: 0, hang: 0, first: 0, jc: 'left', tabs: [], bdr: null, shd: '', kn: false, kl: false, pb: false, numId: null, mark: null, sect: null, rawBdr: '' };
    const apply = (ppr) => {
      if (!ppr) return;
      const sp = kid(ppr, 'spacing'); if (sp) { if (wa(sp, 'before') != null) o.sb = +wa(sp, 'before') / 20; if (wa(sp, 'after') != null) o.sa = +wa(sp, 'after') / 20; if (wa(sp, 'line')) o.line = +wa(sp, 'line') / 240; }
      const ind = kid(ppr, 'ind'); if (ind) { if (wa(ind, 'left') != null) o.left = +wa(ind, 'left'); if (wa(ind, 'right') != null) o.right = +wa(ind, 'right'); o.hang = +(wa(ind, 'hanging') || 0); o.first = +(wa(ind, 'firstLine') || 0); }
      const jc = kid(ppr, 'jc'); if (jc) o.jc = wa(jc, 'val');
      if (kid(ppr, 'keepNext')) o.kn = true; if (kid(ppr, 'keepLines')) o.kl = true; if (kid(ppr, 'pageBreakBefore')) o.pb = true;
      const sh = kid(ppr, 'shd'); if (sh) o.shd = hex(wa(sh, 'fill'));
      const bd = kid(ppr, 'pBdr'); if (bd) { o.rawBdr = new XMLSerializer().serializeToString(bd); o.bdr = {}; [...bd.children].forEach((b) => { o.bdr[b.localName] = { w: +wa(b, 'sz') / 8, space: +wa(b, 'space') || 0, color: hex(wa(b, 'color')) || '#000' }; }); }
      const tb = kid(ppr, 'tabs'); if (tb) kids(tb, 'tab').forEach((t) => { const pos = +wa(t, 'pos'), v = wa(t, 'val'); o.tabs = o.tabs.filter((x) => x.pos !== pos); if (v !== 'clear') o.tabs.push({ pos, v }); });
      const np = kid(ppr, 'numPr'); if (np) o.numId = wa(kid(np, 'numId'), 'val');
      const mk = kid(ppr, 'rPr'); if (mk) o.mark = rprOf(mk);
      const sc = kid(ppr, 'sectPr'); if (sc) o.sect = sc;
    };
    const ppr = kid(pEl, 'pPr'), sid = ppr && kid(ppr, 'pStyle') ? wa(kid(ppr, 'pStyle'), 'val') : null;
    o.styleId = sid;
    if (sid && S.para[sid]) { apply(S.para[sid].ppr); o.styleR = S.para[sid].r; }
    apply(ppr);
    o.tabs.sort((a, b) => a.pos - b.pos);
    return o;
  }

  // ---------------- 形狀 ----------------
  function geomSvg(sp, w, h) {
    const pg = kid(sp, 'prstGeom'), cg = kid(sp, 'custGeom');
    if (cg) {
      const path = kid(kid(cg, 'pathLst'), 'path'), pw = +path.getAttribute('w') || w, ph = +path.getAttribute('h') || h;
      const pt = (e) => `${e.getAttribute('x')} ${e.getAttribute('y')}`;
      let d = '';
      [...path.children].forEach((c) => {
        const ps = [...c.children].map(pt);
        if (c.localName === 'moveTo') d += `M${ps[0]} `; else if (c.localName === 'lnTo') d += `L${ps[0]} `; else if (c.localName === 'cubicBezTo') d += `C${ps.join(' ')} `; else if (c.localName === 'close') d += 'Z ';
      });
      return { kind: 'path', d, vb: `0 0 ${pw} ${ph}` };
    }
    const prst = pg ? pg.getAttribute('prst') : 'rect';
    const gd = pg ? [...(kid(pg, 'avLst') || { children: [] }).children] : [];
    const adj = gd.length ? +gd[0].getAttribute('fmla').replace('val ', '') : null;
    return { kind: prst, adj };
  }
  function color(fillEl) {
    const c = fillEl && kid(kid(fillEl, 'solidFill'), 'srgbClr');
    if (!c) return null;
    const a = kid(c, 'alpha');
    return { c: '#' + c.getAttribute('val'), a: a ? +a.getAttribute('val') / 100000 : 1 };
  }
  function shapeEl(wsp, ctx, abs) {
    const sp = kid(wsp, 'spPr'), xf = kid(sp, 'xfrm'), off = kid(xf, 'off'), ext = kid(xf, 'ext');
    const w = +ext.getAttribute('cx') * PX_EMU, h = +ext.getAttribute('cy') * PX_EMU;
    const x = abs ? +off.getAttribute('x') * PX_EMU : 0, y = abs ? +off.getAttribute('y') * PX_EMU : 0;
    const fill = color(sp), ln = kid(sp, 'ln'), lc = ln && color(ln), lw = ln && ln.getAttribute('w') ? +ln.getAttribute('w') * PX_EMU : 1;
    const g = geomSvg(sp, w, h), flipH = xf.getAttribute('flipH') === '1', flipV = xf.getAttribute('flipV') === '1';
    const div = document.createElement('div'); div.className = 'zzshape';
    div.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    let inner = '';
    const fa = fill ? `fill="${fill.c}" fill-opacity="${fill.a}"` : 'fill="none"', st = lc ? `stroke="${lc.c}" stroke-width="${lw}" stroke-linejoin="round"` : '';
    const ss = Math.min(w, h);
    if (g.kind === 'path') inner = `<svg width="${w}" height="${h}" viewBox="${g.vb}" preserveAspectRatio="none"><path d="${g.d}" ${fa} ${st}/></svg>`;
    else if (g.kind === 'line') inner = `<svg width="${Math.max(w, 1)}" height="${Math.max(h, 1)}"><line x1="0" y1="${flipV ? h : 0}" x2="${w}" y2="${flipV ? 0 : h}" ${st.replace('stroke-linejoin="round"', 'stroke-linecap="butt"')}/></svg>`;
    else if (g.kind === 'roundRect') { const r = ss * (g.adj != null ? g.adj : 16667) / 100000; inner = `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" ${fa} ${st}/></svg>`; }
    else if (g.kind === 'parallelogram') { const o = ss * (g.adj != null ? g.adj : 25000) / 100000; inner = `<svg width="${w}" height="${h}"><polygon points="0,${h} ${o},0 ${w},0 ${w - o},${h}" ${fa} ${st}/></svg>`; }
    else inner = `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" ${fa} ${st}/></svg>`;
    div.innerHTML = inner;
    const tb = kid(kid(wsp, 'txbx'), 'txbxContent');
    if (tb) {
      const bp = kid(wsp, 'bodyPr'), ins = (n) => +(bp && bp.getAttribute(n) || 0) * PX_EMU, anchor = bp ? bp.getAttribute('anchor') : 'ctr';
      const t = document.createElement('div'); t.className = 'ztx';
      if (kid(bp, 'spAutoFit')) div.dataset.autofit = '1';
      t.style.cssText = `left:0;top:0;width:${w}px;${kid(bp, 'spAutoFit') ? '' : 'height:' + h + 'px'};padding:${ins('tIns')}px ${ins('rIns')}px ${ins('bIns')}px ${ins('lIns')}px;justify-content:${anchor === 'b' ? 'flex-end' : anchor === 't' ? 'flex-start' : 'center'};`;
      const ctx2 = Object.assign({}, ctx, { colW: w - ins('lIns') - ins('rIns') });
      [...tb.children].forEach((c) => { if (c.localName === 'p') t.appendChild(paraEl(c, ctx2)); });
      div.appendChild(t);
    }
    return { el: div, w, h };
  }
  function drawingEl(dr, ctx, host) {
    const inl = kid(dr, 'inline'), anc = kid(dr, 'anchor'), box = inl || anc;
    const ext = kid(box, 'extent'), w = +ext.getAttribute('cx') * PX_EMU, h = +ext.getAttribute('cy') * PX_EMU;
    const gd = kid(kid(box, 'graphic'), 'graphicData'), uri = gd.getAttribute('uri') || '';
    let el;
    if (/wordprocessingGroup/.test(uri)) {
      el = document.createElement('span'); el.className = 'zzgrp'; el.style.cssText = `width:${w}px;height:${h}px;`;
      [...kid(gd, 'wgp').children].filter((c) => c.localName === 'wsp').forEach((s) => el.appendChild(shapeEl(s, ctx, true).el));
    } else if (/wordprocessingShape/.test(uri)) {
      const r = shapeEl(kid(gd, 'wsp'), ctx, false);
      el = document.createElement('span'); el.className = 'zzinl'; el.style.cssText = `width:${w}px;`;
      r.el.style.position = 'relative'; r.el.style.left = '0'; r.el.style.top = '0'; r.el.style.display = 'block';
      el.appendChild(r.el);
    } else {
      const blip = gd.getElementsByTagName('a:blip')[0], rid = blip && blip.getAttribute('r:embed'), m = ctx.media[rid];
      el = document.createElement('img'); el.className = 'zzpic'; el.style.cssText = `width:${w}px;height:${h}px;`;
      { const dp = kid(box, 'docPr'), nm = dp && dp.getAttribute('name') || ''; if (/^zzimg:/.test(nm)) { el.dataset.zzimg = nm.slice(6); el.dataset.w0 = w; } }
      if (m) el.src = m;
    }
    if (inl) return { el, anchored: false };
    const ph = kid(anc, 'positionH'), pv = kid(anc, 'positionV');
    const x = +kid(ph, 'posOffset').textContent * PX_EMU, y = +kid(pv, 'posOffset').textContent * PX_EMU;
    el.style.position = 'absolute'; el.style.left = x + 'px'; el.style.top = y + 'px';
    if (anc.getAttribute('behindDoc') === '1') el.style.zIndex = '0';
    return { el, anchored: true, relH: ph.getAttribute('relativeFrom'), relV: pv.getAttribute('relativeFrom'), x, y };
  }

  // ---------------- 段落 ----------------
  function paraEl(p, ctx) {
    const P = pprOf(p, ctx.S);
    const baseR = mergeR(ctx.S.def, P.styleR);
    const div = document.createElement('div'); div.className = 'zzp';
    const _bm = [...p.children].find((c) => c.localName === 'bookmarkStart' && /^zzq_/.test(c.getAttribute('w:name') || ''));
    if (_bm) div.dataset.qid = _bm.getAttribute('w:name').slice(4);
    const markR = mergeR(baseR, P.mark);
    // 編號（大題「一、」、題號「N.(　　)」）
    let lblHtml = null, left = P.left, hang = P.hang, numInline = null;
    if (P.numId && ctx.nums[P.numId]) {
      const nd = ctx.nums[P.numId], n = ctx.counters[P.numId] = (ctx.counters[P.numId] || 0) + 1;
      const num = nd.fmt === 'taiwaneseCountingThousand' ? cnNum(n) : String(n), txt = nd.text.replace('%1', num);
      const lr = mergeR(baseR, nd.r), sp = document.createElement('span'); sp.style.cssText = rStyle(lr); sp.textContent = txt;
      if (nd.jc === 'right') { lblHtml = sp; if (P.left === 0 && nd.left) left = nd.left; if (!P.hang && nd.hang) hang = nd.hang; }
      else { numInline = sp; if (!P.left) left = nd.left; }
      if (nd.jc === 'right') { left = left || nd.left; }
    }
    ctx.sbDefault = markR;
    let ml = left, firstIndent = -hang + P.first;
    const bd = P.bdr || {};
    const bl = bd.left ? bd.left.w * PX_PT : 0, bs = bd.left ? bd.left.space * PX_PT : 0;
    let style = `font-family:${famCss(markR.ascii, markR.east)};font-size:${(markR.sz || 10) * PX_PT}px;`;
    if (markR.color) style += `color:${markR.color};`;
    // 有底色或邊框時，段前段後要在框外（Word 規則），用 margin；其餘用 padding。欄容器是 flex column，margin 不會相鄰合併。
    const boxed = !!(P.shd || P.bdr);
    const mlpx = bd.left ? tw(ml) - bl - bs : 0;
    style += `margin-left:${mlpx}px;margin-right:${tw(P.right) - (bd.right ? bd.right.w * PX_PT + bd.right.space * PX_PT : 0)}px;`;
    style += `padding-left:${bd.left ? bs : tw(ml)}px;`;
    if (bd.left) style += `border-left:${bl}px solid ${bd.left.color};`;
    if (bd.right) style += `border-right:${bd.right.w * PX_PT}px solid ${bd.right.color};padding-right:${bd.right.space * PX_PT}px;`;
    const sbPx = P.sb * PX_PT, saPx = P.sa * PX_PT;
    if (bd.top) style += `border-top:${bd.top.w * PX_PT}px solid ${bd.top.color};padding-top:${bd.top.space * PX_PT}px;`;
    if (bd.bottom) style += `border-bottom:${bd.bottom.w * PX_PT}px solid ${bd.bottom.color};padding-bottom:${bd.bottom.space * PX_PT}px;`;
    style += `margin-top:${sbPx}px;margin-bottom:${saPx}px;`;
    if (P.shd) style += `background:${P.shd};`;
    style += `text-align:${P.jc === 'both' ? 'justify' : P.jc === 'center' ? 'center' : P.jc === 'right' ? 'right' : 'left'};text-indent:${tw(firstIndent)}px;`;
    if (P.line !== 1) style += `line-height:${(P.line * ctx.ratio(markR)).toFixed(3)};`;
    div.style.cssText = style;
    div._zz = { P, boxLeft: mlpx, left: tw(ml), hang: tw(hang), kn: P.kn, kl: P.kl, pb: P.pb, sect: P.sect, bdr: P.rawBdr, hasTabs: false, boxed, sbPx, saPx };
    if (lblHtml) {
      // 標籤右緣＝首行起點（left - hanging），從欄左緣算起；定位基準是本段落的 padding box，往左回推
      lblHtml.className = 'zlbl'; lblHtml.style.left = (-(mlpx + bl)) + 'px'; lblHtml.style.width = (tw(left) - tw(hang)) + 'px';
      div.appendChild(lblHtml);
      if (hang) { const sp = document.createElement('span'); sp.style.cssText = `display:inline-block;width:${tw(hang)}px;`; div.appendChild(sp); }
    }
    if (numInline) div.appendChild(numInline);
    // 內容
    const kidsEl = [...p.children];
    let seg = null, anchorsHere = [], any = false;
    const newSeg = () => { seg = document.createElement('span'); seg.className = 'zseg'; div.appendChild(seg); };
    newSeg();
    const doRuns = (nodes, extraR) => nodes.forEach((n) => {
      if (n.localName === 'fldSimple') { doRuns([...n.children], extraR); return; }
      if (n.localName !== 'r') return;
      const rr = mergeR(mergeR(baseR, extraR), rprOf(kid(n, 'rPr')));
      if (rr.vanish && !ctx.showHidden) return;
      [...n.children].forEach((c) => {
        if (c.localName === 'rPr') return;
        if (c.localName === 't') {
          const t = c.textContent;
          if (n.parentNode && n.parentNode.localName === 'fldSimple' && /PAGE/.test(n.parentNode.getAttribute('w:instr') || '')) { const s = document.createElement('span'); s.style.cssText = rStyle(rr); s.textContent = String(ctx.pageNo || 1); seg.appendChild(s); return; }
          const s = document.createElement('span'); s.style.cssText = rStyle(rr);
          s.textContent = t === '' ? '​' : t; seg.appendChild(s); any = true;
        } else if (c.localName === 'tab') {
          const tb = document.createElement('span'); tb.className = 'ztab'; tb.style.cssText = `font-size:${(rr.sz || 10) * PX_PT}px;`; div.appendChild(tb); div._zz.hasTabs = true; newSeg();
        } else if (c.localName === 'br') {
          div.appendChild(document.createElement('br')); newSeg();
        } else if (c.localName === 'drawing') {
          const d = drawingEl(c, ctx);
          if (d.anchored) { if (d.relH === 'page') (ctx.pageAnchors = ctx.pageAnchors || []).push(d); else div.appendChild(d.el); }
          else { seg.appendChild(d.el); }
          any = true;
        }
      });
    });
    doRuns(kidsEl, null);
    // 空段落：給一個零寬字元撐出行高（行高由段落標記字級決定）
    if (!any && !div.querySelector('.zlbl,.zzgrp,.zzinl')) { const s = document.createElement('span'); s.textContent = '​'; seg.appendChild(s); }
    return div;
  }
  // 後處理：Tab 定位（在已放進 DOM 之後呼叫）
  function fixTabs(div) {
    const z = div._zz; if (!z || !z.hasTabs) return;
    const stops = z.P.tabs.slice(), hangStop = z.left;
    if (z.hang > 0) stops.push({ pos: Math.round(z.left / PX_TW), v: 'left', implicit: true });
    stops.sort((a, b) => a.pos - b.pos);
    const base = div.getBoundingClientRect().left - z.boxLeft, tabs = [...div.querySelectorAll('.ztab')];
    const zoom = div.getBoundingClientRect().width / (div.offsetWidth || 1) || 1;
    tabs.forEach((t) => {
      t.style.width = '0px';
      const x = (t.getBoundingClientRect().left - base) / zoom;   // 距欄左緣（px）
      let st = null;
      for (const s of stops) { if (s.pos * PX_TW > x + 0.5) { st = s; break; } }
      let target;
      if (!st) { const d = 480 * PX_TW; target = (Math.floor(x / d + 1e-6) + 1) * d; st = { v: 'left' }; } else target = st.pos * PX_TW;
      const nxt = t.nextElementSibling, sw = nxt && nxt.classList.contains('zseg') ? nxt.getBoundingClientRect().width / zoom : 0;
      let w = target - x - (st.v === 'right' ? sw + 1 : st.v === 'center' ? sw / 2 + 1 : 0);
      t.style.width = Math.max(0, w) + 'px';
    });
  }

  // ---------------- 表格 ----------------
  function tableEl(tbl, ctx) {
    const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => +wa(g, 'w'));
    const tp = kid(tbl, 'tblPr'), tbd = kid(tp, 'tblBorders'), cm = kid(tp, 'tblCellMar');
    const bd = (n) => { const e = kid(tbd, n); if (!e || wa(e, 'val') === 'nil') return null; return `${+wa(e, 'sz') / 8 * PX_PT}px solid ${hex(wa(e, 'color'))}`; };
    const B = { top: bd('top'), bottom: bd('bottom'), insideH: bd('insideH'), insideV: bd('insideV') };
    const mar = (n, d) => (cm && kid(cm, n) ? +wa(kid(cm, n), 'w') : d);
    const rows = kids(tbl, 'tr'), t = document.createElement('table');
    t.style.cssText = `width:${tw(grid.reduce((a, b) => a + b, 0))}px;`;
    const cg = document.createElement('colgroup'); grid.forEach((g) => { const c = document.createElement('col'); c.style.width = tw(g) + 'px'; cg.appendChild(c); }); t.appendChild(cg);
    // 先算每格的欄起點與 rowspan
    const cells = rows.map((r) => { let ci = 0; return kids(r, 'tc').map((c) => { const pr = kid(c, 'tcPr'), span = pr && kid(pr, 'gridSpan') ? +wa(kid(pr, 'gridSpan'), 'val') : 1, vm = pr && kid(pr, 'vMerge'); const o = { c, pr, ci, span, vm: vm ? (wa(vm, 'val') === 'restart' ? 'restart' : 'cont') : null, rs: 1 }; ci += span; return o; }); });
    cells.forEach((row, ri) => row.forEach((c) => { if (c.vm === 'restart') { for (let k = ri + 1; k < cells.length; k++) { const m = cells[k].find((x) => x.ci === c.ci && x.vm === 'cont'); if (!m) break; m.skip = true; c.rs++; } } }));
    const tbody = document.createElement('tbody'); t.appendChild(tbody);
    const trs = [];
    rows.forEach((r, ri) => {
      const tr = document.createElement('tr'); const trh = kid(kid(r, 'trPr'), 'trHeight'); if (trh) tr.style.height = tw(wa(trh, 'val')) + 'px';
      cells[ri].forEach((c) => {
        if (c.skip) return;
        const td = document.createElement('td'); td.colSpan = c.span; if (c.rs > 1) td.rowSpan = c.rs;
        const pr = c.pr, tcm = kid(pr, 'tcMar'), m = (n, d) => (tcm && kid(tcm, n) ? +wa(kid(tcm, n), 'w') : mar(n, d));
        const sh = kid(pr, 'shd'); let st = `padding:${tw(m('top', 0))}px ${tw(m('right', 108))}px ${tw(m('bottom', 0))}px ${tw(m('left', 108))}px;`;
        if (sh && hex(wa(sh, 'fill'))) st += `background:${hex(wa(sh, 'fill'))};`;
        const va = pr && kid(pr, 'vAlign'); if (va) st += `vertical-align:${wa(va, 'val') === 'center' ? 'middle' : 'top'};`;
        if (ri === 0 && B.top) st += `border-top:${B.top};`; if (ri + c.rs >= rows.length && B.bottom) st += `border-bottom:${B.bottom};`;
        if (ri + c.rs < rows.length && B.insideH) st += `border-bottom:${B.insideH};`;
        if (c.ci > 0 && B.insideV) st += `border-left:${B.insideV};`;
        td.style.cssText = st;
        const cw = grid.slice(c.ci, c.ci + c.span).reduce((a, b) => a + b, 0);
        const cctx = Object.assign({}, ctx, { colW: tw(cw - m('left', 108) - m('right', 108)) });
        kids(c.c, 'p').forEach((p) => td.appendChild(paraEl(p, cctx)));
        tr.appendChild(td);
      });
      tbody.appendChild(tr); trs.push(tr);
    });
    t._zz = { table: true, rows: trs, kn: false, hasTabs: false };
    return t;
  }

  // ---------------- 頁首頁尾 ----------------
  function hfBlocks(xml, ctx) {
    const root = parse(xml), out = [];
    [...root.children].forEach((c) => { if (c.localName === 'p') out.push(paraEl(c, ctx)); });
    return out;
  }

  // ---------------- 版面（分頁） ----------------
  function render(parts, host, opts) {
    opts = opts || {}; ensureCss();
    const S = loadStyles(parts.stylesXml), nums = loadNumbering(parts.numberingXml);
    const mediaUrl = {};
    (parts.media || []).forEach((m, i) => { mediaUrl['rIdImg' + (i + 1)] = URL.createObjectURL(new Blob([m.bytes], { type: /jpe?g$/.test(m.name) ? 'image/jpeg' : 'image/png' })); });
    const pg = parts.pg, pgW = pg.w * PX_CM, pgH = pg.h * PX_CM;
    // Do not re-introduce a browser-only 1 cm assumption here. `parts.pg`
    // originated in paper-layouts.js and is also written to w:pgMar.
    const pm = pg.margin || { top: 1, right: 1, bottom: 1, left: 1 };
    const MT = pm.top * PX_CM, MR = pm.right * PX_CM, MB = pm.bottom * PX_CM, ML = pm.left * PX_CM;
    const bodyH = pgH - MT - MB, bodyW = pgW - ML - MR;
    host.innerHTML = ''; host.classList.add('zzdoc');
    const measure = document.createElement('div'); measure.className = 'zzmeasure'; host.appendChild(measure);
    const ratioCache = {};
    const ratio = (r) => { const f = famCss(r.ascii, r.east); if (ratioCache[f]) return ratioCache[f]; const s = document.createElement('span'); s.style.cssText = `font-family:${f};font-size:100px;line-height:normal;position:absolute;white-space:nowrap`; s.textContent = '國Ag'; measure.appendChild(s); const v = s.getBoundingClientRect().height / 100 || 1.3; measure.removeChild(s); return (ratioCache[f] = v) / 1; };
    const ctx = { S, nums, media: mediaUrl, counters: {}, showHidden: !!opts.showHidden, ratio: (r) => 1 / 1 * (1), colW: bodyW };
    // line-height 倍數：Word 的「多行 N」＝ N × 字型自然行高；CSS 的 unitless 是 N × 字級，所以乘上自然行高比
    ctx.ratio = ratio;
    // 解析內文成區段
    const bodyRoot = parse(`<w:document ${parts.NS}><w:body>${parts.body}</w:body></w:document>`), bodyEl = kid(bodyRoot, 'body');
    const sections = []; let cur = { blocks: [] };
    const secInfo = (sc) => ({ cols: sc && kid(sc, 'cols') ? +(wa(kid(sc, 'cols'), 'num') || 1) : 1, space: sc && kid(sc, 'cols') ? +(wa(kid(sc, 'cols'), 'space') || 709) : 709, sep: !!(sc && kid(sc, 'cols') && wa(kid(sc, 'cols'), 'sep')), cont: !!(sc && kid(sc, 'type') && wa(kid(sc, 'type'), 'val') === 'continuous'), hdr: sc && kid(sc, 'headerReference') ? kids(sc, 'headerReference').map((h) => ({ type: wa(h, 'type'), id: h.getAttribute('r:id') })) : [], ftr: sc && kid(sc, 'footerReference') ? kids(sc, 'footerReference').map((h) => ({ type: wa(h, 'type'), id: h.getAttribute('r:id') })) : [], titlePg: !!(sc && kid(sc, 'titlePg')) });
    // 不同段欄寬不同：先掃出每段的欄數（段落尾端的 sectPr），再逐段產生區塊
    const flat = [...bodyEl.children];
    const secs = []; let tmp = [];
    flat.forEach((c) => {
      if (c.localName === 'sectPr') { secs.push({ nodes: tmp, sc: c }); tmp = []; return; }
      tmp.push(c);
      if (c.localName === 'p') { const ppr = kid(c, 'pPr'), sc = ppr && kid(ppr, 'sectPr'); if (sc) { secs.push({ nodes: tmp, sc }); tmp = []; } }
    });
    if (tmp.length) secs.push({ nodes: tmp, sc: null });
    const result = { pages: 0 };
    // ---- 頁面狀態 ----
    const pages = [];
    const newPage = () => { const d = document.createElement('div'); d.className = 'zzpg'; d.style.cssText = `width:${pgW}px;height:${pgH}px;`; host.appendChild(d); const pgo = { el: d, cols: [], idx: pages.length + 1, sec: null }; pages.push(pgo); return pgo; };
    let page = null, colIdx = 0, curSec = null, colInfo = { cols: 1, colW: bodyW, gap: 0 };
    const mkCol = (pgo, ci, top) => {
      const c = document.createElement('div'); c.className = 'zzcol'; const x = ML + ci * (colInfo.colW + colInfo.gap);
      c.style.cssText = `left:${x}px;top:${MT + top}px;width:${colInfo.colW}px;`; c._top = top; pgo.el.appendChild(c); pgo.cols[ci] = c; pgo.colInfo = colInfo; return c;
    };
    const startPage = () => { page = newPage(); page.sec = curSec; colIdx = 0; mkCol(page, 0, 0); };
    const advance = () => { // 換欄或換頁
      if (colIdx + 1 < colInfo.cols) { colIdx++; if (!page.cols[colIdx]) mkCol(page, colIdx, page.cols[0]._top); }
      else { startPage(); }
    };
    // ---- 分頁：把區塊真的放進欄裡，用實際位置判斷有沒有超出頁面（相鄰段落間距由瀏覽器合併成較大值，與 Word 相同）----
    const curCol = () => page.cols[colIdx];
    const bottomOf = (el) => el.getBoundingClientRect().bottom - curCol().getBoundingClientRect().top;
    const limit = () => bodyH - curCol()._top;
    const fitShapes = (b) => {
      // 「依文字調整圖案大小」的文字方塊（題組框）：高度跟著內容，框線一起縮放
      b.querySelectorAll('.zzshape[data-autofit]').forEach((sh) => {
        const tx = sh.querySelector('.ztx'); if (!tx) return; const h2 = tx.getBoundingClientRect().height, svg = sh.querySelector('svg');
        sh.style.height = h2 + 'px'; if (svg) { svg.setAttribute('height', h2); const r = svg.querySelector('rect'); if (r) r.setAttribute('height', h2); }
      });
    };
    const fixAll = (el) => { if (el.classList && el.classList.contains('zzp')) fixTabs(el); el.querySelectorAll('.zzp').forEach((n) => fixTabs(n)); };
    const fix = (b) => { fixAll(b); fitShapes(b); };
    const atTop = () => !curCol().children.length;
    const add = (b) => {
      if (atTop() && (page.idx > 1 || colIdx > 0) && b._zz && b._zz.P && !b._zz.P.pb) b.style.marginTop = '0px';   // 頁頂不留段前距離
      curCol().appendChild(b); fix(b);
    };
    function placeBlocks(blocks) {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b._zz && b._zz.pb && !atTop()) startPage();
        if (b.tagName === 'TABLE') { placeTable(b); continue; }
        let j = i; while (blocks[j]._zz && blocks[j]._zz.kn && j + 1 < blocks.length && blocks[j + 1].tagName !== 'TABLE') j++;
        const grp = blocks.slice(i, j + 1);
        grp.forEach(add);
        if (bottomOf(grp[grp.length - 1]) > limit() + 0.5) {
          const wasTop = curCol().children.length === grp.length;
          if (!wasTop) { grp.forEach((g) => g.remove()); advance(); grp.forEach(add); }
          if (bottomOf(grp[grp.length - 1]) > limit() + 0.5 && grp.length > 1) {
            grp.forEach((g) => g.remove());
            grp.forEach((g) => { add(g); if (bottomOf(g) > limit() + 0.5 && curCol().children.length > 1) { g.remove(); advance(); add(g); } });
          }
        }
        i = j;
      }
    }
    function placeTable(t) {
      let tbl = t, rows = t._zz.rows.slice();
      const keepOf = (tr) => [...tr.querySelectorAll('.zzp')].some((p) => p._zz && p._zz.kn);
      for (let guard = 0; guard < 300 && rows.length; guard++) {
        add(tbl);
        const r = rows.findIndex((tr) => bottomOf(tr) > limit() + 0.5);
        if (r === -1) break;
        let s2 = r; while (s2 > 0 && keepOf(rows[s2 - 1])) s2--;
        if (s2 === 0) { if (curCol().children.length > 1) { tbl.remove(); advance(); continue; } s2 = Math.max(1, r); }
        const tail = rows.slice(s2), nt = tbl.cloneNode(false); nt.appendChild(tbl.querySelector('colgroup').cloneNode(true));
        const tb = document.createElement('tbody'); nt.appendChild(tb); tail.forEach((tr) => tb.appendChild(tr)); nt._zz = { rows: tail, table: true };
        advance(); tbl = nt; rows = tail;
      }
    }
    // 每段
    secs.forEach((sec, si) => {
      const info = secInfo(sec.sc); sec.info = info;
      curSec = { si, info, sc: sec.sc };
      const newColInfo = { cols: info.cols, sep: info.sep, gap: tw(info.space), colW: info.cols > 1 ? (bodyW - (info.cols - 1) * tw(info.space)) / info.cols : bodyW };
      if (!page) { colInfo = newColInfo; startPage(); }
      else if (info.cont) {
        // 連續分節（例如 ABK：卷頭單欄 → 題目兩欄）：新的欄從目前內容底下開始
        const last = curCol().lastElementChild, top = (last ? bottomOf(last) + (parseFloat(getComputedStyle(last).marginBottom) || 0) : 0) + curCol()._top;
        colInfo = newColInfo; colIdx = 0; page.cols = []; mkCol(page, 0, top);
      } else { colInfo = newColInfo; startPage(); }
      // 轉換區塊
      const blocks = [];
      sec.nodes.forEach((n) => {
        if (n.localName === 'p') { const el = paraEl(n, ctx); if (el._zz.sect && !n.textContent.trim() && !n.getElementsByTagName('w:drawing').length) { /* 純分節符空段落：保留高度（Word 也有一行） */ } blocks.push(el); }
        else if (n.localName === 'tbl') blocks.push(tableEl(n, ctx));
      });
      // 相同邊框的相鄰段落合併成一個框
      for (let i = 1; i < blocks.length; i++) { const a = blocks[i - 1], b = blocks[i]; if (a._zz && b._zz && a._zz.bdr && a._zz.bdr === b._zz.bdr) { a.style.borderBottom = '0'; b.style.borderTop = '0'; } }
      placeBlocks(blocks);
    });
    // ---- 頁首頁尾、欄線、頁碼 ----
    const hfXml = {}; Object.keys(parts.headers).forEach((k) => { hfXml[k] = `<w:x ${parts.NS}>${parts.headers[k]}</w:x>`; });
    pages.forEach((pgo, pi) => {
      const sc = pgo.sec && pgo.sec.info, firstSec = secs[0].info;
      // 此頁用哪一組頁首：該節有 titlePg 且是節的第一頁 → first
      const isFirst = pi === 0 && (firstSec.titlePg), refs = (isFirst ? firstSec.hdr.find((h) => h.type === 'first') : (sc && sc.hdr.find((h) => h.type === 'default')) || firstSec.hdr.find((h) => h.type === 'default'));
      const frefs = (sc && sc.ftr.find((h) => h.type === 'default')) || firstSec.ftr.find((h) => h.type === 'default');
      const pc = Object.assign({}, ctx, { pageNo: pi + 1, colW: bodyW, pageAnchors: [], counters: {} });
      const place = (xml, top, bottom) => {
        const wrap = document.createElement('div'); wrap.className = 'zzcol'; wrap.style.cssText = `left:${ML}px;width:${bodyW}px;${top != null ? 'top:' + top + 'px;' : 'bottom:' + bottom + 'px;'}`;
        const els = hfBlocks(xml, pc); els.forEach((e) => wrap.appendChild(e)); pgo.el.appendChild(wrap); els.forEach((e) => fixAll(e));
      };
      if (refs && hfXml[refs.id.replace('rId_', '')]) place(hfXml[refs.id.replace('rId_', '')], 284 * PX_TW, null);
      if (frefs && hfXml[frefs.id.replace('rId_', '')]) place(hfXml[frefs.id.replace('rId_', '')], null, 284 * PX_TW);
      (pc.pageAnchors || []).forEach((a) => { a.el.style.left = a.x + 'px'; a.el.style.top = a.y + 'px'; a.el.style.zIndex = '0'; pgo.el.insertBefore(a.el, pgo.el.firstChild); });
      // 欄線
      if (pgo.colSwitch === undefined && colInfo.cols > 1 && sc && sc.sep) { /* 下面統一處理 */ }
    });
    // 兩欄的欄線：每頁有兩欄內容時，畫在欄間
    pages.forEach((pgo) => {
      const ci = pgo.colInfo;
      if (ci && ci.cols > 1 && ci.sep) {   // Word 的欄線不論第二欄有沒有內容都會畫
        const c0 = pgo.cols[0], top = parseFloat(c0.style.top), colW = parseFloat(c0.style.width);
        const ln = document.createElement('div'); ln.style.cssText = `position:absolute;left:${ML + colW + ci.gap / 2}px;top:${top}px;height:${pgH - MB - top}px;border-left:1px solid #777;`; pgo.el.appendChild(ln);
      }
    });
    measure.remove();
    result.pages = pages.length; result.pageEls = pages.map((p) => p.el);
    return result;
  }
  window.ZZDocHtml = { render };
})();
