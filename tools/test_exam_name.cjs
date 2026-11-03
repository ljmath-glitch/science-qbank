// Run with Node.js: node tools/test_exam_name.cjs
// 檔名轉題庫考試名稱：自動匯題 raw.html 與手動匯題 raw-manual.html 要一致。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const CASES=[
  ['112_桃園文昌_國七上二段_生物_題目.pdf','桃園文昌國中-七年級-112-上學期-第二次段考-生物'],
  ['112_桃園文昌_國七上二段_生物_題目','桃園文昌國中-七年級-112-上學期-第二次段考-生物'],
  ['114_士林_國八上二段_理化_題目.pdf','士林國中-八年級-114-上學期-第二次段考-理化'],
  ['114_士林國中_八上二段_理化.pdf','士林國中-八年級-114-上學期-第二次段考-理化'],
  ['113_中正_國九下一段_地科_解答.pdf','中正國中-九年級-113-下學期-第一次段考-地科'],
  ['113_百齡_國一下三段_地球科學.pdf','百齡國中-七年級-113-下學期-第三次段考-地科'],
  ['113_介壽_國八上第二次段考_自然_題目.pdf','介壽國中-八年級-113-上學期-第二次段考-自然'],
  ['112 桃園文昌 國七上二段 生物.pdf','桃園文昌國中-七年級-112-上學期-第二次段考-生物'],
  ['112_桃園文昌_國七上二段_題目.pdf','桃園文昌國中-七年級-112-上學期-第二次段考'],
  // 清稿後的檔名會多 -清稿
  ['112_桃園文昌_國七上二段_生物_題目-清稿.pdf','桃園文昌國中-七年級-112-上學期-第二次段考-生物'],
  ['112_桃園文昌_國七上二段-清稿.pdf','桃園文昌國中-七年級-112-上學期-第二次段考'],
  // 原本就能處理的格式不能被影響
  ['士林國中-八年級-114-上學期-第二次段考-理化.pdf','士林國中-八年級-114-上學期-第二次段考-理化'],
  ['114會考_自然.pdf','114會考'],
  ['114_學測_生物.pdf','114學測'],
];
for(const file of ['raw.html','raw-manual.html']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8').split(/\r?\n/);
  const one=name=>{const l=source.find(x=>x.trim().startsWith('function '+name+'('));assert.ok(l,file+' 缺 '+name);return l};
  const ctx=vm.createContext({rawName:{value:''},examName:{value:''},nameStatus:{textContent:''}});
  vm.runInContext(one('parseUnderscoreExamName')+'\n'+one('normalizeName'),ctx);
  for(const [input,want] of CASES){
    ctx.rawName.value=input;ctx.examName.value='';ctx.normalizeName();
    assert.equal(ctx.examName.value,want,file+'：'+input);
  }
}
console.log('PASS exam name: 底線檔名轉題庫名稱、舊格式不受影響（raw、raw-manual）');
