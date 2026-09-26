// Run with Node.js: node tools/test_word_latex.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const context = vm.createContext({
  // No formatting auto-detection is needed for this content-preservation test.
  _textSegs: text => [{ t: text }],
  HL_NAME: {},
  esc: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
});
// Parse every inline script as well, so a helper edit cannot silently break the page.
for (const script of source.matchAll(/<script\b[^>]*>([^]*?)<\/script>/gi)) {
  new vm.Script(script[1]);
}
for (const name of ['normalizeWordLatex', 'stripRichMarks', 'richTextSegs', 'buildRichRuns', '_tplQuestionText', 'buildWordHtml']) {
  const fn = source.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(fn, 'Missing export helper: ' + name);
  vm.runInContext(fn[0], context);
}

const raw = String.raw`20\% 30\\% 40% $\frac{1}{\sqrt{x^{2}+1}}$ $\ce{H2O}$ $\alpha\times\unknown{a}$`;
const expected = String.raw`20% 30% 40% $\frac{1}{\sqrt{x^{2}+1}}$ $\ce{H2O}$ $\alpha\times\unknown{a}$`;
assert.equal(context.normalizeWordLatex(raw), expected);
assert.equal(context.normalizeWordLatex(null), '');
assert.equal(context._tplQuestionText({ q: raw }, false), expected);
assert.equal(context._tplQuestionText({ summary: raw }, false), expected);
assert.equal(context._tplQuestionText({ q: '**' + raw + '**(A) 甲(B) 乙(C) 丙(D) 丁' }),
  expected + '\n(A)甲\n(B)乙\n(C)丙\n(D)丁');
const fiveChoices = context._tplQuestionText({ q: '題幹\n\t（A） 甲\n\t(B)　乙(C) 丙\n(D) 丁\n(E) 戊' });
assert.equal(fiveChoices, '題幹\n(A)甲\n(B)乙\n(C)丙\n(D)丁\n(E)戊');
assert.ok(!fiveChoices.includes('\t'), 'Options must follow the paragraph ruler without an extra tab');
assert.equal(context._tplQuestionText({ q: '題幹\n續行(A)長選項\n選項續行(E) 最後選項' }),
  '題幹\n續行\n(A)長選項\n選項續行\n(E)最後選項');

class TextRun { constructor(opts) { Object.assign(this, opts); } }
const tr = opts => new TextRun(opts);
const runs = context.buildRichRuns('**' + raw + '**\n' + raw, 20, tr, TextRun, { SINGLE: 'single' });
assert.equal(runs.map(run => run.text || '').join(''), expected + expected);
assert.equal(runs[0].bold, true);
assert.ok(runs.some(run => run.break === 1), 'Word line breaks must be preserved');
const html = context.buildWordHtml('Test', [{ q: raw, sol: raw }], 'full', false, false, false, {});
assert.ok(!html.includes(String.raw`\%`));
assert.ok(html.includes(expected), 'HTML Word fallback must also preserve TeX');
assert.ok(!/latexToPlain\(/.test(source.match(/^function _tplQuestionText\([^]*?^}/m)[0]));
console.log('Word LaTeX regression tests passed (percent, nested formulas, chemistry, formatting and options).');
