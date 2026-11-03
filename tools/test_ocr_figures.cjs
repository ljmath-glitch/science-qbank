// Run with Node.js: node tools/test_ocr_figures.cjs
// 茲茲 OCR 的 figures（格式見 exam-answer-key-formatter/local-app/server.js 的 pyOcrResponse）要能進手動切圖清單。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','raw.html'),'utf8');
function fn(signature){const start=source.indexOf(signature);assert.ok(start>=0,'Missing: '+signature);const end=source.slice(start).search(/\r?\n    \}\r?\n/);assert.ok(end>=0,'No end: '+signature);return source.slice(start,start+end)+'\n}';}

const requested=[];
const ctx=vm.createContext({console:{warn(){}},
  fetch:async url=>{requested.push(url);if(url.includes('bad'))return {ok:false,status:500};return {ok:true,blob:async()=>url}},
  FileReader:class{readAsDataURL(blob){this.result='data:image/png;base64,'+Buffer.from(blob).toString('base64');this.onload()}},
  document:{getElementById:()=>({textContent:'',closest:()=>null,scrollIntoView(){}}),querySelector:()=>null},
  renderCropCandidates(){},cropCandidates:[],OCR_PDF_FILE:null,cropFiles:{},alert(){}});
vm.runInContext(fn('async function ocrFetchFigures(')+'\n'+fn('function ocrToBatch(')+'\nvar OCR_RESULT=null;',ctx);

const fig=(page,k)=>({name:`exam_p${page}_fig${k}.png`,url:`/api/py-ocr/figure?job=j&name=exam_p${page}_fig${k}.png`});
(async()=>{
  // 檔名字典序 p10 會排在 p2 前面、fig10 排在 fig2 前面，必須依數字排
  const r=await ctx.ocrFetchFigures('https://host',[fig(10,1),fig(2,10),fig(2,2),{name:'exam_p3_fig1.png',url:'/bad'}]);
  assert.deepEqual(requested.slice(0,1),['https://host/api/py-ocr/figure?job=j&name=exam_p10_fig1.png']);
  assert.deepEqual(Array.from(r.pages,p=>p.page),[2,10]);
  assert.deepEqual(Array.from(r.pages[0].blocks,b=>b.label),['p2圖2','p2圖10']);
  assert.equal(r.count,3);assert.equal(r.failed,1,'單張失敗只計數，不丟例外');

  // 舊主機沒有 figures 欄位
  const empty=await ctx.ocrFetchFigures('https://host',undefined);
  assert.equal(empty.count,0);assert.equal(empty.pages.length,0);

  ctx.OCR_RESULT=r;vm.runInContext('OCR_RESULT=this.OCR_RESULT',ctx);
  ctx.ocrToBatch();
  assert.equal(ctx.cropCandidates.length,3);
  const names=Array.from(ctx.cropCandidates,c=>c.filename);
  assert.equal(new Set(names).size,3,'題號未知的圖檔名不可相同，否則 ZIP 互相覆蓋：'+names);
  assert.ok(ctx.cropCandidates.every(c=>c.qno===null&&c.verdict==='review'&&Number.isInteger(c.page)));
  assert.equal(ctx.cropCandidates[2].page,10);

  ctx.ocrToBatch();
  assert.equal(ctx.cropCandidates.length,3,'重複按不可重複加入');
  console.log('PASS OCR figures: 數字排序、單張失敗、無 figures、檔名不重複、重複按不重複加入');
})().catch(e=>{console.error(e);process.exit(1)});
