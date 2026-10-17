const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
function fn(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);}
// One-line helpers need their own extraction.
const one=name=>source.split('\n').find(l=>l.startsWith('function '+name+'('));
const ctx={PASSAGES:{},stripRichMarks:x=>x,esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;')};vm.createContext(ctx);
vm.runInContext([one('solutionWritingRules'),one('solutionSummary'),...['makeSolPrompt','buildSolBatchPrompt','solutionExportQuestion','solutionHtml'].map(fn)].join('\n'),ctx);
for(const p of [ctx.makeSolPrompt('題目','B','',''),ctx.makeSolPrompt('題目','','',''),ctx.buildSolBatchPrompt([]),ctx.buildSolBatchPrompt([{exam:'測試',no:'1',q:'題目',ans:'B'}])]){
 for(const text of ['只用國中課綱','否定題','計算題','不留空格','一般數字及單位','需人工確認'])assert.ok(p.sys.includes(text),text);
 assert.doesNotMatch(p.msg,/氧化數|在【解題關鍵】前/);
}
const q=ctx.solutionExportQuestion({ans:'B',sol:'【解題關鍵】\n舊關鍵\n(A)不該留下\n【詳解】\n共同說明\n(A)錯誤：第一行\n第二行原因\n(B)正確：理由\n【觀念補充】\n(C)不該留下'},1);
assert.equal(q.detail,'共同說明');assert.equal(q.options.length,2);assert.equal(q.options[0].text,'錯誤：第一行\n第二行原因');
assert.equal(ctx.solutionExportQuestion({ans:'C',sol:'直接計算步驟'},2).detail,'直接計算步驟');
assert.equal(ctx.solutionSummary([{answer:'AC'},{answer:'B'},{answer:'D'},{answer:'C'},{answer:'A'},{answer:'CE'}]),'ACBDCA/CE');
const html=ctx.solutionHtml('<測試>',[q]);assert.ok(html.includes('&lt;測試>'));assert.match(html,/<table>/);assert.doesNotMatch(html,/舊關鍵|不該留下/);
const exporter=source.slice(source.indexOf('async function downloadSolutionWord(){'),source.indexOf('// 模考／會考格式'));
assert.match(exporter,/rows:questions.flatMap\(questionRows\)/);assert.doesNotMatch(exporter,/line:360|normalizeWordLatex/);assert.match(exporter,/snapToGrid:false/);
const mock=source.slice(source.lastIndexOf("if(paperKind==='mock'){"));assert.match(mock,/ansMode==='full'\)\{await downloadSolutionWord/);
assert.match(source,/const sys=solutionWritingRules\(\)\+'\\n只輸出修改後/);
console.log('PASS solution rules: syntax, prompt entry points, old sections, multiline options, plain calculations, multi-answer grouping, HTML escaping, Word and mock routing');
