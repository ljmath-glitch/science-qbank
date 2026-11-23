const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const L = require('../paper-layouts.js');

const sandbox = { window: { PaperLayouts: L }, console };
sandbox.window.window = sandbox.window;
vm.runInNewContext(fs.readFileSync(require.resolve('../zz-exam-docx.js'), 'utf8'), sandbox);
const Z = sandbox.window.ZZExam;
const base = kind => ({
  kind, style: 'formal', field: '自然', title: '驗證考卷', teacher: false,
  meta: { subject: '自然', book: '第一冊', label: '第一章', variant: 'A', chapter: '輔導題目', code: 'ABK-A', year: '115', semester: '1', version: '綜合版', scope: '第一章', bookTitle: '模考題本', exam: '第一次', count: 1 },
  running: { left: '自然', right: '驗證' }, footer: '自然',
  sections: [{ title: '單選題', score: '每題 2 分，共 2 分', items: [{ no: 1, kind: 'choice', stem: '題幹', options: ['(A)甲', '(B)乙', '(C)丙', '(D)丁'], layout: { optionMode: 'four', breakBefore: true, keepTogether: true }, imgs: [] }] }]
});

for (const kind of ['formal', 'pre', 'abk', 'golden', 'mock']) {
  const p = Z.buildParts(base(kind));
  assert.ok(p.body.includes('<w:pgSz'), kind + ' emits page geometry');
  assert.ok(p.body.includes('w:pageBreakBefore'), kind + ' reads per-question break');
  assert.ok(p.body.includes('w:keepNext'), kind + ' reads per-question keep');
  assert.ok(p.stylesXml.includes('w:tab w:val="left" w:pos="3000"'), kind + ' uses Word option tabs');
  if (kind === 'abk') {
    assert.equal(p.cols, 2);
    assert.match(p.body, /w:cols w:num="2"[^>]*w:sep="1"/);
    assert.doesNotMatch(p.body, /ABK 卷頭|浮水印/);
    assert.match(p.body, /茲茲正式版卷頭/);
  }
  if (kind === 'golden') {
    assert.match(p.stylesXml, /w:sz w:val="16"/);
    assert.match(p.body, /w:pgSz w:w="11907" w:h="16840"/);
    assert.match(p.body, /w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567"/);
    assert.match(p.body, /w:cols w:num="1"/);
  }
}
const solution = Z.buildParts({ kind: 'solution', style: 'formal', field: '自然', title: '驗證詳解', meta: { title: '驗證詳解', scope: '第一章', answers: ['A'] }, running: { left: '詳解', right: '' }, footer: '自然', solutions: [{ no: 1, answer: 'A', detail: '說明', options: [] }] });
assert.ok(solution.body.includes('詳解'));
const imageSpec = base('formal');
imageSpec.sections[0].items[0].imgs = [{ bytes: new Uint8Array([137,80,78,71]), ext: 'png', cx: 720000, cy: 360000 }];
const imageParts = Z.buildParts(imageSpec);
assert.match(imageParts.body, /<wp:inline/);
assert.doesNotMatch(imageParts.body, /<wp:anchor/);
assert.match(imageParts.body, /cx="720000" cy="360000"/);
const alignSpec = base('formal');
alignSpec.sections[0].items[0].id = 'abc';
alignSpec.sections[0].items[0].imgs = [{ bytes: new Uint8Array([137,80,78,71]), ext: 'png', cx: 720000, cy: 360000, align: 'right', tag: 'abc_0' }];
const alignParts = Z.buildParts(alignSpec);
assert.match(alignParts.body, /name="zzimg:abc_0"/, 'image carries its question tag for the preview editor');
assert.match(alignParts.body, /<w:jc w:val="right"\/>[\s\S]{0,400}<wp:inline/, 'image paragraph follows the chosen alignment');
console.log('zz-exam-docx: ok');
