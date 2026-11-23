// Word 預覽就地編輯（index.html）的純邏輯：標記文字 ⇄ 編輯框 HTML、序列化、公式 chip、圖片縮放／對齊／刪除、Tab 導覽。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require.resolve('../index.html'), 'utf8');
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' exists');
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const ctx = { Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
vm.createContext(ctx);
vm.runInContext(['esc', 'applyRichMarks', '_rgbToHex', 'serializeRichText', '_mtMathSpans', '_edQidOf', '_edEscAttr', '_edNormText', '_edRawToHtml', '_edSerialize', '_edSupSubLatex', '_edNextKey', '_edImgsPatch', '_edImgsRemove', '_edResizeW', '_edClampZzw'].map(fn).join('\n'), ctx);

// 迷你假 DOM（只夠 serializeRichText 用）
const T = (s) => ({ nodeType: 3, textContent: s });
const E = (tag, kids = [], o = {}) => ({ nodeType: 1, tagName: tag, childNodes: kids, classList: { contains: (c) => (o.cls || []).includes(c) }, dataset: o.data || {}, style: o.style || {}, getAttribute: () => null });
const J = (x) => JSON.parse(JSON.stringify(x));
const root = (kids) => ({ childNodes: kids });

// data-qid：與 zz-exam-docx.js 的書籤同規則（去除非英數底線、最多 34 字）
assert.equal(ctx._edQidOf('a-1.b'), 'a1b');
assert.equal(ctx._edQidOf('x'.repeat(50)).length, 34);

// 標記文字 → 編輯框 HTML：公式變 chip、**粗體**、\n → <br>、不洩漏未跳脫的 <
const mathFn = (l, d) => '[' + (d ? '$$' : '$') + l + ']';
assert.equal(ctx._edRawToHtml('a **b** $x^{2}$ c\n(A)1<2', mathFn), 'a <b>b</b> [$x^{2}] c<br>(A)1&lt;2');
assert.equal(ctx._edRawToHtml('**$x$**', mathFn), '<b>[$x]</b>');       // 粗體包公式
assert.equal(ctx._edRawToHtml('價格 \\$5 與 $a__b$', mathFn), '價格 \\$5 與 [$a__b]');   // 公式內的 __ 不會被當成底線；\$ 不是公式
assert.equal(ctx._edRawToHtml('$$E=mc^2$$', mathFn), '[$$E=mc^2]');
assert.equal(ctx._edRawToHtml('', mathFn), '');

// 序列化：B/I/U/字級/顏色、換行、公式 chip 還原成 $…$、標籤不算文字
const chip = E('SPAN', [T('katex 渲染出來的字')], { cls: ['zz-eq'], data: { latex: 'x^{2}' } });
const chipD = E('SPAN', [T('x')], { cls: ['zz-eq'], data: { latex: 'a', d: '$$' } });
const lab = E('SPAN', [T('1.')], { cls: ['zz-ed-lab'] });
assert.equal(ctx._edSerialize(root([lab, T('題幹 '), E('B', [T('粗')]), E('BR'), T('(A) '), chip, E('BR'), E('I', [T('斜')]), E('U', [T('底')]), chipD])), '題幹 **粗**\n(A) $x^{2}$\n##斜##__底__$$a$$');
assert.equal(ctx._edSerialize(root([E('SPAN', [T('大')], { style: { fontSize: '19px' } })])), '{{19}}大{{/}}');
assert.equal(ctx._edSerialize(root([E('DIV', [T('a')]), E('DIV', [T('b')])])), 'a\nb');   // Chrome 的 Enter 會產生 <div>
// 存回前的清洗：NBSP、零寬字元、頭尾空行
assert.equal(ctx._edNormText('\n\n a b​ \n\n'), ' a b');
// 讀進來再序列化不變（沒改動就不會存）
const raw = '題幹 $x$\n(A) **粗**';
assert.equal(ctx._edNormText(raw), raw);

// 上標／下標：選取文字 → $^{…}$／$_{…}$；含換行、$、空選取不合格
assert.equal(ctx._edSupSubLatex('2', '^'), '^{2}');
assert.equal(ctx._edSupSubLatex('n+1', '_'), '_{n+1}');
assert.equal(ctx._edSupSubLatex('', '^'), null);
assert.equal(ctx._edSupSubLatex('a\nb', '^'), null);
assert.equal(ctx._edSupSubLatex('$x$', '_'), null);
assert.equal(ctx._edSupSubLatex('2', 'x'), null);

// Tab／方向鍵移到下一題
assert.equal(ctx._edNextKey(['a', 'b', 'c'], 'a', 1), 'b');
assert.equal(ctx._edNextKey(['a', 'b', 'c'], 'a', -1), null);
assert.equal(ctx._edNextKey(['a', 'b', 'c'], 'c', 1), null);
assert.equal(ctx._edNextKey(['a'], 'zz', 1), null);

// 圖片：對齊／縮放用 patch、null 刪欄位；原陣列不被改動；可移除
const imgs = [{ src: 'a', zzw: 100 }, { src: 'b', zzalign: 'left' }];
const p1 = ctx._edImgsPatch(imgs, 1, { zzalign: 'right', zzw: 150 });
assert.deepEqual(J(p1[1]), { src: 'b', zzalign: 'right', zzw: 150 });
assert.deepEqual(imgs[1], { src: 'b', zzalign: 'left' });
assert.equal(p1[0], imgs[0]);
assert.deepEqual(J(ctx._edImgsPatch(imgs, 0, { zzw: null, zzalign: null })[0]), { src: 'a' });   // 還原
assert.deepEqual(J(ctx._edImgsRemove(imgs, 0)), [imgs[1]]);
assert.equal(ctx._edClampZzw(5), 20);
assert.equal(ctx._edClampZzw(9999), 600);
assert.equal(ctx._edClampZzw(132.4), 132);

// 八向把手：左右用水平位移（西側反向）、上下用垂直位移等比換算、角落取位移較大者、最小 24
assert.equal(ctx._edResizeW('e', 100, 50, 30, 0), 130);
assert.equal(ctx._edResizeW('w', 100, 50, 30, 0), 70);
assert.equal(ctx._edResizeW('s', 100, 50, 0, 10), 120);   // 高 +10 → 寬 +20（等比）
assert.equal(ctx._edResizeW('n', 100, 50, 0, 10), 80);
assert.equal(ctx._edResizeW('se', 100, 50, 10, 40), 180);
assert.equal(ctx._edResizeW('nw', 100, 50, -20, 0), 120);
assert.equal(ctx._edResizeW('e', 100, 50, -500, 0), 24);

// 版面接線：沒有「版面預覽／編輯題目」切換鈕、功能區與狀態列存在、點題不再開彈窗
assert.ok(!/id="pvWordToggle"/.test(src));
assert.ok(/id="pvRibbon"/.test(src) && /id="pvStatus"/.test(src));
assert.ok(!/closest\('\.pv-wordhost \.zzp\[data-qid\]'\):null;if\(el\)pvQuickEdit/.test(src));
assert.match(src, /el\.offsetWidth\?r0\.width\/el\.offsetWidth:1/);   // 圖片縮放要換算預覽 zoom
console.log('pv-inline-edit: ok');
