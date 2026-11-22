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
  QAGate: {checkFields: () => [], options: () => ({}), paperFlags: () => []},
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
vm.runInContext(`papers={first:[{'題號':'1','題目':'題','答案':'A'}],${JSON.stringify(dangerousName)}:[{'題號':'1','題目':'題','答案':'A'}]};selected={exam:${JSON.stringify(dangerousName)},index:0};render()`, context);
const buttons = elements.get('exams').innerHTML;
assert.ok(!buttons.includes('onclick="pick('));
assert.ok(buttons.includes('data-exam="second&quot; onclick=&quot;throw new SyntaxError()"'));
elements.get('exams').listener({target: {closest: () => ({dataset: {exam: dangerousName}})}});
assert.equal(vm.runInContext('selected.exam', context), dangerousName);

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
