// Run with Node.js: node tools/test_exam_pdf_key.cjs
// 考卷原稿的 Storage 路徑只能有英數與少數符號；中文考試名稱會被拒絕（Invalid key）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const line = source.split(/\r?\n/).find(l => l.startsWith('function _examPdfSlug('));
assert.ok(line, 'Missing _examPdfSlug');
const ctx = vm.createContext({});
vm.runInContext(line, ctx);

// Supabase Storage 檢查 object key 用的規則
const SUPABASE_KEY = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;
const names = ['明湖國中-八年級-115-上學期-第一次段考-理化', '明湖國中-八年級-115-上學期-第二次段考-理化', '114會考', 'abc'];
const slugs = names.map(n => ctx._examPdfSlug(n));
for (const s of slugs) {
  const key = `exam-pdfs/${s}_mw0oxp0p.pdf`;
  assert.match(key, SUPABASE_KEY);
  assert.match(s, /^[a-z0-9]+$/);
}
assert.equal(new Set(slugs).size, names.length, '不同考卷不可算出相同代碼');
assert.equal(ctx._examPdfSlug(names[0]), slugs[0], '同一份考卷要算出相同代碼');
assert.match(ctx._examPdfSlug(''), /^[a-z0-9]+$/);
console.log('PASS exam pdf key:', slugs.join(' '));
