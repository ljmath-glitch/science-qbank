// Word 預覽（zz-docx-html.js）與真 Word 對齊的幾條規則（2026-11 以 Mac Word 匯出 PDF 實測）：
// 華康／內文金萱單行高 1.3、中英數交界補 1/4 字空隙、純圖片段落行高＝圖高、「下一頁」分節新頁保留段前距離。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync(require.resolve('../zz-docx-html.js'), 'utf8');
assert.match(src, /const HK_LH = 1\.3;/, '華康單行高常數 1.3');
assert.match(src, /isHK\(rr\) && \/\[\\u3000-\\u9fff/, '含中文的華康 run 設 line-height');
assert.match(src, /function fillAutoSpace/, 'autoSpaceDE/DN 空隙');
assert.match(src, /verticalAlign = 'bottom'/, '純圖片段落不留下伸部');
assert.match(src, /page\.keepTop = true/, '分節新頁保留段前距離');
// fillAutoSpace 的行為：只在 中文字↔英數 交界插空隙，括號/標點不插
const m = src.match(/const AS_CJK[\s\S]*?\n  function fillAutoSpace[\s\S]*?\n  }\n/);
assert.ok(m, 'fillAutoSpace source');
const mk = () => ({ kids: [], appendChild(c) { this.kids.push(c); } });
const document = { createElement: () => ({ style: {}, set className(v) {} }), createTextNode: (t) => ({ t }) };
const fill = new Function('document', m[0] + '; return fillAutoSpace;')(document);
const run = (t, prev) => { const el = mk(); fill(el, t, prev); return el.kids.map((k) => (k.t !== undefined ? k.t : '|')).join(''); };
assert.equal(run('為 80kg 與60kg,假設'), '為 80kg 與|60kg,假設');   // 空白旁不插；與60 之間插
assert.equal(run('分別為80kg'), '分別為|80kg');
assert.equal(run('(A)馬達'), '(A)馬達');
assert.equal(run('80kg', '為'), '|80kg');   // 跨 run
assert.equal(run('公噸'), '公噸');
console.log('zz-docx-html-fidelity: ok');
