const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../paper-layouts.js');
for (const [kind, variant] of [['abk', 'A'], ['abk', 'B'], ['formal'], ['pre'], ['golden'], ['mock']]) {
  const x = L.get(kind, variant);
  assert.equal(L.cmToTwips(x.marginCm.left), Math.round(x.marginCm.left * 567));
  assert.equal(L.cmToEmu(x.marginCm.left), Math.round(x.marginCm.left * 360000));
  assert.equal(x.contentWidthCm, x.paper.widthCm - x.marginCm.left - x.marginCm.right);
  assert.ok(x.bodyPt > 0 && x.columns.body > 0);
}
assert.equal(L.get('abk', 'A').marginCm.left, 1.27);
assert.equal(L.get('abk', 'B').marginCm.left, 1);
assert.equal(L.get('golden').bodyPt, 8);
// docs/product/sample-layouts.md 實測的黃金模擬考規格：A4、1 cm、單欄、8 pt。
const golden = L.get('golden');
assert.deepEqual(golden.paper, { widthCm: 21, heightCm: 29.7 });
assert.deepEqual(golden.marginCm, { top: 1, right: 1, bottom: 1, left: 1 });
assert.deepEqual(golden.columns, { first: 1, body: 1, gapCm: 0, separator: false });
assert.equal(golden.bodyPt, 8);
// 其餘三種尚無對應樣卷的字級／行距／題距量測；鎖住既有頁面設定，避免臆測改動。
for (const kind of ['formal', 'pre', 'mock']) {
  const x = L.get(kind);
  assert.deepEqual(x.paper, { widthCm: 21, heightCm: 29.7 }, kind + ' keeps its existing A4 size');
  assert.deepEqual(x.marginCm, { top: 1, right: 1, bottom: 1, left: 1 }, kind + ' keeps its existing margins');
  assert.deepEqual(x.columns, { first: 1, body: 1, gapCm: 0, separator: false }, kind + ' keeps its existing single column');
  assert.deepEqual(x.question, { line: 1, beforePt: 3.6, afterPt: 3.6, keepLines: true }, kind + ' keeps undocumented question spacing');
}
assert.equal(L.optionLayout(['(A)甲','(B)乙','(C)丙','(D)丁'], 19).cols, 4);
assert.equal(L.optionLayout(['(A)這是一個很長很長很長很長很長的選項','(B)短'], 8).cols, 1);
const word = fs.readFileSync(require.resolve('../zz-exam-docx.js'), 'utf8');
const preview = fs.readFileSync(require.resolve('../zz-docx-html.js'), 'utf8');
assert.match(word, /PaperLayouts\.get/);
assert.match(word, /optionLayout/);
assert.match(preview, /pg\.margin/);
console.log('paper-layouts: ok');
