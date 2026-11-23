#!/usr/bin/env node
/* Minimal DOM simulation for review.html's XSS and exam-button regressions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('review.html', 'utf8');
const source = html.match(/<script>\n([\s\S]*?)\n<\/script><\/body>/)[1];
const elements = new Map();
for (const id of ['storage-notice', 'exams', 'review']) {
  elements.set(id, {hidden: true, innerHTML: '', textContent: '', addEventListener(type, fn) { this.listener = fn; }});
}
const document = {getElementById: id => elements.get(id), querySelectorAll: () => []};
const context = {
  window: {katex: {renderToString: formula => `<span class="katex">${formula}</span>`}},
  document,
  localStorage: {getItem: () => null, setItem: () => {}},
  structuredClone: value => JSON.parse(JSON.stringify(value)),
  alert: () => {}, Blob: class {}, URL: {createObjectURL: () => '', revokeObjectURL: () => {}},
  console,
  QAGate: {checkFields: question => question.flags || [], options: () => ({}), paperFlags: () => []},
};
context.window.supabase = null;
vm.createContext(context);
vm.runInContext(source, context);

const rendered = vm.runInContext("renderMath('<img src=x onerror=alert(1)> $x$')", context);
assert.ok(rendered.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!rendered.includes('<img'));

context.localStorage.getItem = () => '{not json';
vm.runInContext('state=loadState()', context);
assert.equal(vm.runInContext('JSON.stringify(state)', context), '{"reviews":{},"log":[]}');
assert.equal(elements.get('storage-notice').hidden, false);
context.localStorage.setItem = () => { throw new Error('storage disabled'); };
vm.runInContext("persist('storage fallback', {'題號':'1'})", context);
assert.equal(vm.runInContext('state.log[0].action', context), 'storage fallback');

const dangerousName = 'second" onclick="throw new SyntaxError()';
vm.runInContext(`papers={first:[{'題號':'1','題目':'題','答案':'A',flags:[['warn','x','x']]}],${JSON.stringify(dangerousName)}:[{'題號':'1','題目':'題','答案':'A',flags:[['warn','x','x']]}]};selected={exam:${JSON.stringify(dangerousName)},index:0};render()`, context);
const buttons = elements.get('exams').innerHTML;
assert.ok(!buttons.includes('onclick="pick('));
assert.ok(buttons.includes('data-exam="second&quot; onclick=&quot;throw new SyntaxError()"'));
elements.get('exams').listener({target: {closest: () => ({dataset: {exam: dangerousName}})}});
assert.equal(vm.runInContext('selected.exam', context), dangerousName);

vm.runInContext(`state={reviews:{},log:[]};showAll=false;papers={clean:[{'題號':'1','題目':'題','答案':'A'}],small:[{'題號':'1','題目':'題','答案':'A',flags:[['warn','x','x']]}],big:[{'題號':'1','題目':'題','答案':'A',flags:[['block','x','x']]},{'題號':'2','題目':'題','答案':'A',flags:[['warn','x','x']]},{'題號':'3','題目':'題','答案':'A'}]};selected={exam:'clean',index:0};render()`, context);
const problemExams = elements.get('exams').innerHTML;
assert.ok(problemExams.includes('big'));
assert.ok(problemExams.includes('small'));
assert.ok(!problemExams.includes('clean'));
assert.ok(problemExams.indexOf('big') < problemExams.indexOf('small'));
assert.match(problemExams, /2 題待看 \/ 共 3 題/);
assert.deepEqual([...vm.runInContext("visibleIndexes('big')", context)], [0, 1]);
assert.equal(vm.runInContext('selected.exam', context), 'big');
vm.runInContext('move(1)', context);
assert.equal(vm.runInContext('selected.index', context), 1);
vm.runInContext('defer()', context);
assert.equal(vm.runInContext('selected.index', context), 1);
vm.runInContext('setShowAll(true)', context);
assert.ok(elements.get('exams').innerHTML.includes('clean'));
assert.deepEqual([...vm.runInContext("visibleIndexes('big')", context)], [0, 1, 2]);

let imageContext;
context.QAGate.checkFields = (_question, ctx) => { imageContext = ctx; return []; };
vm.runInContext("papers={image:[{'題號':'1','題目':'題','答案':'A',imgs:['image.png']}]};selected={exam:'image',index:0};render()", context);
assert.equal(imageContext.hasImage, true);

let alertMessage = '';
context.alert = message => { alertMessage = message; };
context.QAGate.checkFields = () => [['block', 'blocked', 'must fix']];
vm.runInContext("state={reviews:{'::1':{orig:{},statuses:{stem:'approved',ans:'approved',sol:'pending',img:'approved'},deferred:false}},log:[]};enableQuestion()", context);
assert.match(alertMessage, /無法啟用/);
assert.equal(vm.runInContext('state.log.length', context), 0);
console.log('review XSS and exam event-delegation simulation: ok');
