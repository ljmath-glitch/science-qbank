// Word 預覽（index.html）的純邏輯：data-qid 找回題庫題目、上下移/拖曳跨分區忽略。
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
const moves = [];
const items = [
  { id: 'a-1', k: 's' }, { id: 'b.2', k: 's' }, { id: 'g1', k: 'g' }, { id: 'g2', k: 'g' },
  { id: 'long-id-with-dash-abcdefghijklmnopqrstuvwxyz-0123456789', k: 's' },
];
const ctx = {
  DB: items,
  pickedItems: () => items,
  orderPaperItems: (x) => x,
  paperQuestionSections: (x) => ({ ordered: [...x].sort((a, b) => (a.k === 'g') - (b.k === 'g')), kindOf: (it) => it.k }),
  pvReorderQuestion: (d, t) => moves.push([d, t]),
  _pvQBarHide() {},
};
vm.createContext(ctx);
vm.runInContext(['_pvDbByQid', '_pvMoveTo', 'pvNudgeQuestion'].map(fn).join('\n'), ctx);
// data-qid 是去掉特殊字元（英數與底線、最多 34 字）後的值，仍要找得回題庫 id
assert.equal(ctx._pvDbByQid('a1').id, 'a-1');
assert.equal(ctx._pvDbByQid('zzq_b2').id, 'b.2');
assert.equal(ctx._pvDbByQid('longidwithdashabcdefghijklmnopqrst').id, items[4].id);
assert.equal(ctx._pvDbByQid('nope'), null);
// 同分區才會動；跨分區（單選 → 題組）在預覽看不出來，必須忽略
ctx.pvNudgeQuestion('b.2', -1);
assert.deepEqual(moves.splice(0), [['b.2', 'a-1']]);
ctx.pvNudgeQuestion('long-id-with-dash-abcdefghijklmnopqrstuvwxyz-0123456789', 1);   // 單選的最後一題，下一個是題組
assert.deepEqual(moves.splice(0), []);
ctx.pvNudgeQuestion('a-1', -1);   // 第一題上移
assert.deepEqual(moves.splice(0), []);
ctx._pvMoveTo('g1', 'a-1', false);   // 拖到別的分區
assert.deepEqual(moves.splice(0), []);
ctx._pvMoveTo('g1', 'g1', true);     // 拖到自己
assert.deepEqual(moves.splice(0), []);
// 圖片縮放把手要換算預覽 zoom（窄螢幕時 host 有 zoom）
assert.match(src, /z=el\.offsetWidth\?r0\.width\/el\.offsetWidth:1/);
console.log('pv-preview-helpers: ok');
