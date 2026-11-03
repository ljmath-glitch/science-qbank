// Run with Node.js: node tools/test_exam_pdf_key.cjs
// 考卷原稿的 Storage 路徑只能有英數與少數符號；中文考試名稱要依規則轉成看得懂的英文。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = source.indexOf('const _PDF_SUBJECT=');
const end = source.indexOf('function _loadPinyin()');
assert.ok(start >= 0 && end > start, 'Missing slug code');
const ctx = vm.createContext({});
vm.runInContext(source.slice(start, end).replace(/const (_PDF_\w+)=/g, 'var $1=') , ctx);

const SCHOOLS = { 士林: 'shilin', 明湖: 'minghu', 桃園文昌: 'taoyuanwenchang', 康軒: 'kangxuan' };
const py = t => SCHOOLS[t] || t;
const cases = [
  ['士林國中-八年級-114-上學期-第二次段考-理化', 'shilin-g8-114-s1-exam2-physchem'],
  ['明湖國中-八年級-115-上學期-第一次段考-理化', 'minghu-g8-115-s1-exam1-physchem'],
  ['桃園文昌國中-七年級-112-下學期-第三次段考-生物', 'taoyuanwenchang-g7-112-s2-exam3-biology'],
  ['士林國中-八年級-113上-第二次段考', 'shilin-g8-113-s1-exam2'],
  ['康軒-九年級-114-第一次模擬考-自然', 'kangxuan-g9-114-mock1-science'],
  ['114會考', '114-cap'],
  ['114學測', '114-gsat'],
  ['115分科測驗', '115-ast'],
];
// Supabase Storage 檢查 object key 用的規則
const SUPABASE_KEY = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;
for (const [name, want] of cases) {
  assert.equal(ctx._examPdfSlug(name, py), want);
  assert.match(`exam-pdfs/${want}_mw0oxp0p.pdf`, SUPABASE_KEY);
}
// 拼音工具載入失敗：檔名仍然合法，不同學校也不會相同
const a = ctx._examPdfSlug(cases[0][0], null), b = ctx._examPdfSlug(cases[1][0], null);
assert.match(`exam-pdfs/${a}_x.pdf`, SUPABASE_KEY);
assert.notEqual(a, b);
assert.equal(ctx._examPdfSlug('', py), 'exam');
console.log('PASS exam pdf key:', cases.map(c => c[1]).join(' '));
