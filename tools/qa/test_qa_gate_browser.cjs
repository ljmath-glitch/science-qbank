#!/usr/bin/env node
/* Node-side parity evidence for the browser option parser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {window: {}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('qa-gate.js', 'utf8'), context);
const expected = {A: '甲', B: '乙', C: '丙', D: '丁'};
for (const source of ['何者正確A.甲B.乙C.丙D.丁', '何者正確A.甲B.乙C.丙D. 丁']) {
  assert.deepEqual({...context.window.QAGate.options(source)}, expected);
}
console.log('qa-gate browser option-marker parity: ok');
