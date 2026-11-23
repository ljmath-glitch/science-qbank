const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../paper-layouts.js');
for (const [kind, variant] of [['abk', 'A'], ['abk', 'B'], ['golden']]) {
  const x = L.get(kind, variant);
  assert.equal(L.cmToTwips(x.marginCm.left), Math.round(x.marginCm.left * 567));
  assert.equal(x.contentWidthCm, x.paper.widthCm - x.marginCm.left - x.marginCm.right);
  assert.ok(x.bodyPt > 0 && x.columns.body > 0);
}
assert.equal(L.get('abk', 'A').marginCm.left, 1.27);
assert.equal(L.get('abk', 'B').marginCm.left, 1);
assert.equal(L.get('golden').bodyPt, 8);
assert.equal(L.optionLayout(['(A)甲','(B)乙','(C)丙','(D)丁'], 19).cols, 4);
assert.equal(L.optionLayout(['(A)這是一個很長很長很長很長很長的選項','(B)短'], 8).cols, 1);
const word = fs.readFileSync(require.resolve('../zz-exam-docx.js'), 'utf8');
const preview = fs.readFileSync(require.resolve('../zz-docx-html.js'), 'utf8');
assert.match(word, /PaperLayouts\.get/);
assert.match(word, /optionLayout/);
assert.match(preview, /pg\.margin/);
console.log('paper-layouts: ok');
