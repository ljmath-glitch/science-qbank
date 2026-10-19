const assert=require('assert');
const core=require('../analysis-core.js');
const fixture=require('./fixtures/exam_names.json');
let tests=0, assertions=0;
function test(name,fn){try{fn();tests++;console.log('✓ '+name);}catch(error){console.error('✗ '+name);console.error(error.stack);process.exitCode=1;}}
function eq(actual,expected,message){assertions++;assert.deepStrictEqual(actual,expected,message);}
function near(actual,expected,message){assertions++;assert.ok(Math.abs(actual-expected)<1e-6,message||`${actual} != ${expected}`);}
function ok(value,message){assertions++;assert.ok(value,message);}
const q=(id,exam,school,kp,extra={})=>Object.assign({id,exam,school,kp,unit:'單元',sub:'s',field:'理化',book:'B3',type:'A1',step:1,mem:1,con:1,ans:'A',summary:id},extra);
const group=q=>core.parseKp(q.kp).filter(x=>x.kind==='content').map(x=>x.code);

test('同題多知識點：primary 與 involved 占比及總數不同',()=>{
  const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1、Bb-Ⅳ-1'),q('b','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1')],ex=core.buildExams(rows,{minQuestions:1});
  const primary=core.shares(rows,ex,group,{countMode:'primary'}), involved=core.shares(rows,ex,group,{countMode:'involved'});
  eq(primary.totalN,2);eq(involved.totalN,3);near(primary.groups['Ba-Ⅳ-1'].share,1);near(involved.groups['Ba-Ⅳ-1'].share,2/3);near(involved.groups['Bb-Ⅳ-1'].share,1/3);
});
test('部分試卷：預設排除，completeOnly=false 納入',()=>{
  const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1'),q('b','乙國中-八年級-112上-第一次段考','乙國中','Ba-Ⅳ-1'),q('p','文章卷','甲國中','',{type:'passage'})],ex=core.buildExams(rows,{minQuestions:2});
  eq(core.filterQuestions(rows,ex,{}).length,0);eq(core.filterQuestions(rows,ex,{completeOnly:false}).length,2);eq(ex[core.parseExam('文章卷','甲國中').key].reason,'僅題組文章');
});
test('重複題：僅跨試卷標記，不把同卷重複誤報',()=>{
  const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1',{summary:'同題',ans:'B'}),q('b','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1',{summary:' 同 題 ',ans:'B'}),q('c','乙國中-八年級-112上-第一次段考','乙國中','Ba-Ⅳ-1',{summary:'同題',ans:'B'}),q('d','乙國中-八年級-112上-第一次段考','乙國中','Ba-Ⅳ-1',{summary:'只在同卷',ans:'A'}),q('e','乙國中-八年級-112上-第一次段考','乙國中','Ba-Ⅳ-1',{summary:'只在同卷',ans:'A'})];
  const flagged=core.flagDuplicates(rows);eq(flagged.length,1);eq(flagged[0].ids.sort(),['a','b','c']);eq(flagged[0].examKeys.length,2);
});
test('不同年度與共同範圍：commonScope 只保留每年都有的群組',()=>{
  const rows=[];for(let y=111;y<=112;y++){for(let i=0;i<20;i++)rows.push(q(`${y}-${i}`,`${y}學測`,'',i<10?'Ba-Ⅳ-1':'Bb-Ⅳ-1'));}rows.push(q('only','112學測','','Bc-Ⅳ-1'));
  const tr=core.trend(rows,core.buildExams(rows,{minQuestions:1}),group,[111,112],{commonScope:true});ok(tr['Ba-Ⅳ-1']);ok(tr['Bb-Ⅳ-1']);eq(tr['Bc-Ⅳ-1'],undefined);near(tr['Ba-Ⅳ-1'].years[111].share,.5);
});
test('學校卷數不同：每卷等權與題數合併權重不同',()=>{
  const rows=[];for(let i=0;i<10;i++)rows.push(q('a'+i,'甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1'));rows.push(q('b','乙國中-八年級-112上-第一次段考','乙國中','Bb-Ⅳ-1'));const ex=core.buildExams(rows,{minQuestions:1});
  near(core.shares(rows,ex,group,{weight:'question'}).groups['Ba-Ⅳ-1'].share,10/11);near(core.shares(rows,ex,group,{weight:'exam'}).groups['Ba-Ⅳ-1'].share,.5);
});
test('無題章節：呼叫端的既有章節可安全呈現 0 與空 ids',()=>{const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1')],s=core.shares(rows,core.buildExams(rows,{minQuestions:1}),group);const none=s.groups['不存在']||{share:0,ids:[]};eq(none.share,0);eq(none.ids,[]);});
test('未完成難度：任一 0 即 unscored，預設值另標示且品質統計排除平均',()=>{const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1',{step:0,mem:2,con:2}),q('b','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1',{step:2,mem:2,con:2})],ex=core.buildExams(rows,{minQuestions:1});eq(core.difficulty(rows[0]).scored,false);eq(core.difficulty(rows[1]).defaultSuspect,true);eq(core.dataQuality(rows,ex).unscoredDifficulty.count,1);});
test('同時多校選取：school array 會回傳兩校題目',()=>{const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1'),q('b','乙國中-八年級-112上-第一次段考','乙國中','Ba-Ⅳ-1'),q('c','丙國中-八年級-112上-第一次段考','丙國中','Ba-Ⅳ-1')],ex=core.buildExams(rows,{minQuestions:1});eq(core.filterQuestions(rows,ex,{school:['甲國中','乙國中']}).map(x=>x.id),['a','b']);});
test('不同教材版本：不同章名以相同課綱碼合併',()=>{const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1',{unit:'南一章'}),q('b','乙國中-八年級-112上-第一次段考','乙國中','Ba-Ⅳ-1',{unit:'翰林章'})],s=core.shares(rows,core.buildExams(rows,{minQuestions:1}),group);eq(s.groups['Ba-Ⅳ-1'].ids.sort(),['a','b']);eq(s.groups['Ba-Ⅳ-1'].n,2);});
test('exam 三種真實拼寫合併同一 key',()=>{const variants=fixture.filter(x=>x.exam==='天母國中-八年級-111-上學期-第三次段考').map(x=>x.exam);variants.push('天母國中-八年級-111上-第三次段考','天母國中-八年級-111-上學期-第三次段考-理化');eq(variants.length,3);eq(new Set(variants.map(x=>core.parseExam(x,'天母國中').key)).size,1);});
test('Wilson interval：8/10 已知區間與 0/0 安全值',()=>{const ci=core.wilson(8,10);ok(Math.abs(ci[0]-.490)<.001);ok(Math.abs(ci[1]-.943)<.001);eq(core.wilson(0,0),[0,0]);});
test('小樣本警告：trend 與 coverage 的 valid exam / question 門檻',()=>{const rows=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1')],ex=core.buildExams(rows,{minQuestions:1}),tr=core.trend(rows,ex,group,[112],{}),by={};by[Object.keys(ex)[0]]=rows;eq(tr['Ba-Ⅳ-1'].sampleWarning,true);const cv=core.coverage(ex,by,group);eq(cv['Ba-Ⅳ-1'].n,1);eq(cv['Ba-Ⅳ-1'].k,1);eq(cv['Ba-Ⅳ-1'].sampleWarning,true);});
test('比較：依差異絕對值由大到小排列',()=>{const a=[q('a','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1'),q('b','甲國中-八年級-112上-第一次段考','甲國中','Ba-Ⅳ-1')],b=[q('c','乙國中-八年級-112上-第一次段考','乙國中','Bb-Ⅳ-1')],rows=core.compare(a,b,group,{minQuestions:1});eq(rows.groups.map(x=>x.key),['Ba-Ⅳ-1','Bb-Ⅳ-1']);near(rows.groups[0].difference,100);});
test('parseKp：內容與表現並存，第一個內容碼才是唯一 primary',()=>{const kp=core.parseKp('ti-Ⅳ-1、Ba-Ⅳ-1 能量、INa-Ⅴc-1 物質、po');eq(kp.map(x=>x.kind),['performance','content','content','performance']);eq(kp.map(x=>x.primary),[false,true,false,false]);eq(kp.filter(x=>x.primary).length,1);});
test('難度邊界：任何一項為 0 都不計分',()=>{for(const values of [[0,1,1],[1,0,1],[1,1,0]])eq(core.difficulty({step:values[0],mem:values[1],con:values[2]}).scored,false);});
test('考卷名稱 fixture：類別與年度解析率至少 95%',()=>{const parsed=fixture.map(x=>core.parseExam(x.exam,x.school));ok(parsed.filter(x=>x.category!=='其他').length/parsed.length>=.95);ok(parsed.filter(x=>x.year!=null).length/parsed.length>=.95);});
console.log(`analysis-core: ${tests} named tests, ${assertions} assertions passed`);
