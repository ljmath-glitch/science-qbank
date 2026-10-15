const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const docx=require('docx');
const JSZip=require('jszip');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
// Compile every inline script so changes to prompts and preview markup are checked too.
for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const items=[
 {ans:'B',sol:'【詳解】\nW=FS=200×2=400J。'},
 {ans:'D',sol:'【詳解】\n(A)錯誤：力具有方向。\n(D)正確：功沒有方向。'},
 {ans:'B',sol:'【詳解】\n先比較施力方向與位移方向。\n(A)錯誤：沒有位移。\n(B)正確：沿施力方向移動。'},
];
let blob,closed=false;
const element=()=>({style:{},remove(){},click(){}});
const ctx={window:{docx},PICKS:new Set([1,2,3]),pickedItems:()=>items,paperQuestionSections:x=>({ordered:x}),
 _ensureDocxLib:async()=>{},stamp:()=> 'test',paperDlg:{close(){closed=true;}},
 alert:message=>{throw new Error(message);},URL:{createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL(){}},setTimeout(){},
 document:{createElement:element,body:{appendChild(){},removeChild(){}},getElementById:()=>({value:'詳解排版測試'})},
 esc:x=>String(x),applyRichMarks:x=>x,fixLatex:x=>x,_paperSettingsPage:0};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function solutionSummary('),source.indexOf('// 模考／會考格式：')),ctx);
vm.runInContext(source.slice(source.indexOf('function _solPreviewSheet('),source.indexOf('function refreshPaperSettingsPreview(')),ctx);
vm.runInContext(source.match(/function solutionWritingRules\(\)\{[^\n]+/)[0],ctx);
(async()=>{
 const questions=items.map((it,i)=>ctx.solutionExportQuestion(it,i+1));
 assert.deepEqual(questions.map(q=>ctx.solutionExplanationRows(q).length),[1,2,3]);
 assert.equal(ctx.solutionExplanationRows(questions[1])[0].label,'【詳解】');
 assert.equal(ctx.solutionExplanationRows(questions[0])[0].option,'');
 for(const q of questions){
  const html=ctx.solutionHtml('測試',[q]);
  assert.equal((html.match(/<tr>/g)||[]).length,ctx.solutionExplanationRows(q).length+1);
  assert.equal((html.match(/【詳解】/g)||[]).length,1);
 }
 const commonPreview=ctx._solPreviewSheet('測試',[questions[0]]);
 assert.ok(!commonPreview.includes('<span class="pdoc-sol-opt">'));
 const optionsPreview=ctx._solPreviewSheet('測試',[questions[1]]);
 assert.equal((optionsPreview.match(/class="pdoc-sol-line"/g)||[]).length,3);
 assert.ok(optionsPreview.includes('【詳解】</span><span class="pdoc-sol-opt">(A)'));
 assert.ok(ctx.solutionWritingRules().includes('同一個概念、判斷或計算能在一段交代清楚'));
 assert.ok(!ctx.solutionWritingRules().includes('每個選項約40'));
 await ctx.downloadSolutionWord();
 assert.ok(blob&&closed);
 const zip=await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
 const xml=await zip.file('word/document.xml').async('string');
 const rows=xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g)||[];
 assert.equal(rows.length,9,'No empty shared-detail row for options-only question');
 assert.equal((xml.match(/【詳解】/g)||[]).length,3);
 assert.ok(rows[1].includes('w:gridSpan w:val="2"'),'Unified detail spans option column');
 assert.ok(rows[3].includes('【詳解】')&&rows[3].includes('(A)'),'First option carries detail label');
 assert.ok(!rows[3].includes('w:gridSpan'),'Option explanations retain separate label and content');
 const missing=ctx.solutionExportQuestion({ans:'A',sol:''},4);
 assert.ok(ctx.solutionExplanationRows(missing)[0].text.includes('尚未建立'));
 const emptyOptions=ctx.solutionExportQuestion({ans:'B',sol:'【詳解】\n同一個概念即可判斷。\n(A)\n(B)\n(C)\n(D)'},5);
 assert.equal(emptyOptions.options.length,0,'Empty option markers must not manufacture explanation fields');
 assert.equal(ctx.solutionExplanationRows(emptyOptions).length,1);
 console.log('PASS: prompt, parsing, preview, HTML, and real DOCX export for unified/options-only/mixed explanations');
})().catch(e=>{console.error(e);process.exitCode=1;});
