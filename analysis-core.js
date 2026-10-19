(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AnalysisCore=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  /* Public UI API:
   * parseExam(name, school) -> exam metadata including stable key.
   * parseKp(kpText) -> [{code,text,kind,primary}].
   * difficulty(question) -> {step,mem,con,total,scored,band,defaultSuspect}.
   * normType(raw) -> persisted type code or null; chartClass(raw) -> broad chart class or null.
   * canonicalSource(school, examName) -> {name,kind}; normalizeQuestion(question) -> shallow normalized copy.
   * buildExams(questions, opts) -> {key: exam}; filterQuestions(questions, exams, filters) -> question[].
   * unitOf(question, mode) -> textbook unit; shares(questions, exams, groupFn, opts) -> {groups,totalN,examN}.
   * coverage(exams, questionsByExam, groupFn) -> {group:{k,n,rate,ci,sampleWarning}}.
   * trend(questions, exams, groupFn, years, opts) -> {group:{years,difference,sampleWarning,arrow}}.
   * wilson(k,n) -> [lower,upper]; compare(setA,setB,groupFn,opts) -> comparison rows.
   * flagDuplicates(questions) -> [{key,ids,examKeys}]; dataQuality(questions,exams) -> quality metrics.
   */
  var PUBLISHERS=['南一','翰林','康軒'];
  /* Keep these names aligned with QTYPES in index.html.  The codes are the
     persisted values; names are only used to accept legacy display values. */
  var QTYPE_NAMES={A1:'概念辨識',A2:'概念推論',A3:'概念比較',B1:'圖表判讀',B2:'圖表推論',B3:'圖表計算',C1:'實驗操作',C2:'實驗設計',C3:'實驗結果推論',D1:'單步計算',D2:'多步計算',D3:'估算判斷',E1:'情境判斷',E2:'情境推論',E3:'長文閱讀',填:'填充（非選）',計:'計算（非選）'};
  /* Add aliases here as source data is cleaned. Keys deliberately retain the
     human-readable canonical school name used by the analysis UI. */
  var SOURCE_ALIASES={'桃園市新興高中附設國中部':'新興高中附設國中部','新興高中附中':'新興高中附設國中部'};
  var HANLIN_RULES=[[/^1-1/,'一-1'],[/^1-2/,'一-2'],[/^1-3/,'一-3'],[/^2-1|EFa-Ⅴc-1/,'三-1'],[/^2-2/,'三-2'],[/^2-3/,'三-3'],[/EEd-Ⅴc-1/,'二-3'],[/^5-.*EEd-Ⅴc-[24]/,'二-4'],[/^5-.*EEd-Ⅴc-3/,'二-6'],[/^5-2/,'二-5'],[/^5-1/,'二-1/2'],[/^5-3/,'二-3'],[/^3-1/,'五-1'],[/^3-2.*EIb-Ⅴc-4/,'五-4'],[/^3-2/,'五-2'],[/^3-3/,'五-3'],[/^3-4/,'五-5'],[/^3-5/,'五-6'],[/^4-1/,'四-1'],[/^4-2/,'四-2'],[/^4-3/,'六-2'],[/^6-1/,'六-1'],[/^7-|ENa-Ⅴc-2/,'七'],[/^6-/,'六-3']];
  function str(x){return String(x==null?'':x).trim();}
  function arr(x){return Array.isArray(x)?x:(x==null||x===''?[]:[x]);}
  function cnNum(x){return({'一':1,'二':2,'三':3,'1':1,'2':2,'3':3})[x]||null;}
  function isPassage(q){return q&&q.type==='passage';}
  function normType(raw){
    var t=str(raw); if(!t)return null; if(t.toLowerCase()==='passage')return'passage';
    var code=t.match(/^([A-E][1-3]|填|計)(?=\s|$|[\u4e00-\u9fff（(])/i);
    if(code&&QTYPE_NAMES[code[1].toUpperCase()]!==undefined)return code[1].toUpperCase();
    var keys=Object.keys(QTYPE_NAMES); for(var i=0;i<keys.length;i++){var k=keys[i],name=QTYPE_NAMES[k];if(t===k||t===name||t===k+' '+name||t===k+name)return k;}
    return null;
  }
  function chartClass(raw){
    var t=str(raw); if(!t)return null;
    if(/^(無|無圖表|none)$/i.test(t))return'none';
    if(/表格|表\s*格/.test(t))return'table';
    if(/(資料|比熱|溫度|數據)表$/.test(t))return'table';
    if(/電路/.test(t))return'circuit';
    if(/照片|相片|實物|影像/.test(t))return'photo';
    if(/場線|等值線|磁力線|電力線/.test(t))return'field';
    if(/統計|長條|圓餅|直方|散佈/.test(t))return'statistic';
    if(/示意/.test(t)&&!/曲線/.test(t))return'diagram';
    if(/溫度計/.test(t))return'diagram';
    if(/函數|曲線|折線|運動圖|波動圖|升溫|降溫|加熱|冷卻|三態|混合|溫度時間/.test(t))return'function';
    if(/示意|光學|力學|微觀|模型|裝置|結構|變化圖|流程|剖面/.test(t))return'diagram';
    return'other';
  }
  function canonicalSource(school,examName){
    var raw=str(school),exam=str(examName),combined=raw+' '+exam, publisher=PUBLISHERS.find(function(x){return combined.indexOf(x)>=0;});
    if(/會考|國中教育會考|教育會考/.test(combined))return{name:'教育部會考',kind:'exam-board'};
    if(publisher)return{name:publisher,kind:'publisher'};
    var name=SOURCE_ALIASES[raw]||raw;
    if(!name){var parsed=parseExam(exam,'');name=SOURCE_ALIASES[parsed.school]||parsed.school||'';}
    return name?{name:name,kind:'school'}:{name:'',kind:'unknown'};
  }
  function parseExam(name,school){
    var raw=str(name),s=raw.replace(/附中/g,'國中').replace(/國中教育會考|教育會考/g,'會考').replace(/模考/g,'模擬考');
    var category=/會考/.test(s)?'會考':/學測/.test(s)?'學測':/分科|指考/.test(s)?'分科':/模擬|北模|全模/.test(s)?'模擬考':(/段考/.test(s)||school||/國[中小]|高[中職]/.test(s))?'段考':'其他';
    var ym=s.match(/(?:^|[^\d])(1\d{2})(?!\d)/),year=ym?+ym[1]:null,tm=s.match(/[上下](?:學期)?/),term=tm?tm[0][0]:null;
    var gm=s.match(/([七八九])年級|國([一二三])|高三/),grade=gm?(gm[1]||({'一':'七','二':'八','三':'九'}[gm[2]])||'高三'):null;
    if(!grade&&(category==='會考'||category==='模擬考'))grade='九'; if(!grade&&(category==='學測'||category==='分科'))grade='高三';
    var pm=s.match(/第?\s*([一二三123])\s*次?\s*(?:段考|模擬考?)/)||s.match(/([一二三123])\s*段/),sm=s.match(/(?:第?\s*)?([EN]\s*\d+)/i);
    var extracted=(s.match(/^(.+?)(?=[\s_－—–-]*(?:[七八九]年級|國[一二三]|高三|1\d{2}))/)||[])[1]||''; extracted=extracted.replace(/[\s_－—–-]/g,'');
    var publisher=PUBLISHERS.find(function(x){return s.indexOf(x)>=0})||null,source=str(school)||extracted||publisher||(category==='會考'?'會考':''); source=source.replace(/附中/g,'國中').replace(/[\s_－—–-]/g,'');
    var period=pm?cnNum(pm[1]):null,series=sm?sm[1].replace(/\s/g,'').toUpperCase():null,subject=(s.match(/理化|生物|地科|自然|物理|化學/)||[])[0]||null;
    var confidence=year&&category!=='其他'&&((category==='段考'&&source&&grade&&term&&period)||category!=='段考')?'high':'low';
    return{raw:raw,key:[category,source,grade||'',year||'',term||'',period||'',series||''].join('|'),category:category,school:source||null,publisher:publisher,grade:grade,year:year,term:term,period:period,series:series,subjectHint:subject,confidence:confidence};
  }
  function parseKp(kpText){
    var items=str(kpText).split('、').map(function(text){text=text.trim();var m=text.match(/[A-Za-z]{1,4}-[ⅠⅡⅢⅣⅤ]+[a-z]?-[0-9]+|\b(?:ti|tm|po|pe|pa|pc|an|ah|ai|ei|ec|es)\b/i),code=m?m[0]:'';return{code:code,text:text,kind:code&&/^[a-z]/.test(code)?'performance':'content',primary:false};}).filter(function(x){return x.text;});
    var primary=items.find(function(x){return x.code&&x.kind==='content';});if(primary)primary.primary=true;return items;
  }
  function difficulty(q){var step=+q.step||0,mem=+q.mem||0,con=+q.con||0,scored=!!(step&&mem&&con),total=scored?step+mem+con:0,band=!scored?null:total<=4?'簡單':total<=6?'中等':total<=8?'困難':'極難';return{step:step,mem:mem,con:con,total:total,scored:scored,band:band,defaultSuspect:scored&&step===2&&mem===2&&con===2};}
  function normalizeQuestion(q){var exam=parseExam(q.exam,q.school),kp=parseKp(q.kp),primary=kp.find(function(x){return x.primary;});return Object.assign({},q,{_type:normType(q.type),_chartClass:chartClass(q.chart),_source:canonicalSource(q.school,q.exam),_difficulty:difficulty(q),_primaryKp:primary||null,_exam:exam});}
  function buildExams(questions,opts){opts=opts||{};var min=opts.minQuestions==null?15:+opts.minQuestions,out={};(questions||[]).forEach(function(q){var meta=parseExam(q.exam,q.school),e=out[meta.key]||(out[meta.key]={key:meta.key,meta:meta,questionIds:[],n:0,fields:new Set(),isPassageOnly:true,complete:false,reason:''});if(isPassage(q))return;e.questionIds.push(q.id);e.n++;e.isPassageOnly=false;if(q.field)e.fields.add(q.field);});Object.keys(out).forEach(function(k){var e=out[k];e.reason=e.isPassageOnly?'僅題組文章':e.n<min?'題數少於'+min:'';e.complete=!e.reason;});return out;}
  function unitOf(q,mode){if(mode==='hanlin'){var both=str(q.sub)+' '+str(q.kp);for(var i=0;i<HANLIN_RULES.length;i++)if(HANLIN_RULES[i][0].test(both))return HANLIN_RULES[i][1];return'未分類';}return{unit:q.unit||'',sub:q.sub||''};}
  function filterQuestions(questions,exams,filters){filters=filters||{};exams=exams||{};function match(v,vs){vs=arr(vs);return!vs.length||vs.indexOf(v)>=0;}var types=arr(filters.qtype).map(normType);return(questions||[]).filter(function(q){if(isPassage(q))return false;var n=normalizeQuestion(q),m=n._exam,e=exams[m.key];if(filters.completeOnly!==false&&(!e||!e.complete))return false;if(!match(m.category,filters.category)||!match(n._source.name,filters.school)||!match(m.grade,filters.grade)||!match(q.field,filters.subject)||!match(q.book,filters.book)||!match(q.unit,filters.unit)||!match(q.sub,filters.sub)||!match(n._type,types)||!match(n._chartClass,filters.chart))return false;var y=filters.year||{},lo=y.min!=null?y.min:(y.from!=null?y.from:y.start),hi=y.max!=null?y.max:(y.to!=null?y.to:y.end);return!(lo!=null&&m.year<lo)&&!(hi!=null&&m.year>hi)&&match(m.term,filters.term)&&match(m.period,filters.period)&&match(n._difficulty.band,filters.difficultyBand);});}
  function validExamList(exams){return Object.keys(exams||{}).map(function(k){return exams[k];}).filter(function(e){return e.complete;});}
  function valuesFor(q,fn,mode){var v=fn(q);v=(Array.isArray(v)?v:[v]).filter(function(x){return x!==undefined&&x!==null&&x!=='';});return mode==='primary'?v.slice(0,1):v;}
  function shares(questions,exams,groupFn,opts){opts=opts||{};var mode=opts.countMode||'primary',weight=opts.weight||'question',valid=new Set(validExamList(exams).map(function(e){return e.key;})),groups={},total=0,examIds=new Set();(questions||[]).forEach(function(q){var ek=parseExam(q.exam,q.school).key;if(!valid.has(ek)||isPassage(q))return;var vs=valuesFor(q,groupFn,mode);if(!vs.length)return;var w=weight==='exam'?1/Math.max(exams[ek].n,1):1;vs.forEach(function(g){var x=groups[g]||(groups[g]={n:0,share:0,examCount:0,ids:[],_ex:new Set()});x.n+=w;x.ids.push(q.id);x._ex.add(ek);total+=w;});examIds.add(ek);});Object.keys(groups).forEach(function(g){groups[g].examCount=groups[g]._ex.size;delete groups[g]._ex;groups[g].share=total?groups[g].n/total:0;});return{groups:groups,totalN:total,examN:examIds.size};}
  function wilson(k,n){if(!n)return[0,0];var z=1.96,p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return[Math.max(0,c-h),Math.min(1,c+h)];}
  function coverage(exams,questionsByExam,groupFn){
    var valid=validExamList(exams),hits={},questionN=0;
    valid.forEach(function(e){
      var examQuestions=questionsByExam[e.key]||[],seen=new Set();
      questionN+=examQuestions.filter(function(q){return!isPassage(q);}).length;
      examQuestions.forEach(function(q){valuesFor(q,groupFn,'involved').forEach(function(g){seen.add(g);});});
      seen.forEach(function(g){hits[g]=(hits[g]||0)+1;});
    });
    var out={},sampleWarning=valid.length<5||questionN<20;
    Object.keys(hits).forEach(function(g){out[g]={k:hits[g],n:valid.length,rate:valid.length?hits[g]/valid.length:0,ci:wilson(hits[g],valid.length),sampleWarning:sampleWarning};});
    return out;
  }
  function trend(questions,exams,groupFn,years,opts){opts=opts||{};var ys=(years||[]).map(Number),valid=new Set(validExamList(exams).map(function(e){return e.key;})),per={};ys.forEach(function(y){var qs=(questions||[]).filter(function(q){return valid.has(parseExam(q.exam,q.school).key)&&parseExam(q.exam,q.school).year===y&&!isPassage(q);});per[y]={qs:qs,s:shares(qs,exams,groupFn,opts),examN:new Set(qs.map(function(q){return parseExam(q.exam,q.school).key;})).size};});var groups=new Set();ys.forEach(function(y){Object.keys(per[y].s.groups).forEach(function(g){groups.add(g);});});if(opts.commonScope)groups=new Set(Array.from(groups).filter(function(g){return ys.every(function(y){return!!per[y].s.groups[g];});}));var out={},split=opts.recentYears||Math.max(1,Math.ceil(ys.length/2));groups.forEach(function(g){var byYear={};ys.forEach(function(y){var x=per[y].s.groups[g];byYear[y]={n:x?x.n:0,share:x?x.share:0};});function avg(list){return list.length?list.reduce(function(sum,y){return sum+byYear[y].share;},0)/list.length:0;}var recent=avg(ys.slice(-split)),earlier=avg(ys.slice(0,-split)),warn=ys.some(function(y){return per[y].examN<5||per[y].qs.length<20;});out[g]={years:byYear,difference:(recent-earlier)*100,sampleWarning:warn,arrow:warn?null:recent>earlier?'↑':recent<earlier?'↓':'→'};});return out;}
  function compare(setA,setB,groupFn,opts){opts=opts||{};function make(set){var ex=buildExams(set,opts);return shares(set,ex,groupFn,opts);}var a=make(setA),b=make(setB),keys=new Set(Object.keys(a.groups).concat(Object.keys(b.groups))),rows=Array.from(keys).map(function(k){var as=a.groups[k]?a.groups[k].share:0,bs=b.groups[k]?b.groups[k].share:0;return{key:k,a:as,b:bs,difference:(as-bs)*100};}).sort(function(x,y){return Math.abs(y.difference)-Math.abs(x.difference);});return{groups:rows,a:{n:a.totalN,examN:a.examN},b:{n:b.totalN,examN:b.examN}};}
  function norm(s){return str(s).toLowerCase().replace(/\s+/g,'').replace(/[，,。．、；;：:“”"'()（）\[\]【】!?！？]/g,'');}
  function flagDuplicates(questions){var buckets={};(questions||[]).forEach(function(q){if(isPassage(q)||!str(q.summary))return;var primary=parseKp(q.kp).find(function(x){return x.primary;}),key=norm(q.summary)+'|'+str(q.ans)+'|'+(primary?primary.code:'');(buckets[key]||(buckets[key]=[])).push(q);});return Object.keys(buckets).map(function(key){return{key:key,ids:buckets[key].map(function(q){return q.id;}),examKeys:Array.from(new Set(buckets[key].map(function(q){return parseExam(q.exam,q.school).key;})))};}).filter(function(x){return x.examKeys.length>1;});}
  function dataQuality(questions,exams){var qs=(questions||[]).filter(function(q){return!isPassage(q);}),n=qs.length;function metric(c){return{count:c,rate:n?c/n:0};}function count(fn){return qs.filter(fn).length;}return{n:n,missingUnit:metric(count(function(q){return!str(q.unit);})),missingKp:metric(count(function(q){return!str(q.kp);})),missingAnswer:metric(count(function(q){return!str(q.ans);})),unscoredDifficulty:metric(count(function(q){return!difficulty(q).scored;})),suspectedDefaultDifficulty:metric(count(function(q){return difficulty(q).defaultSuspect;})),incompleteExams:Object.keys(exams||{}).map(function(k){return exams[k];}).filter(function(e){return!e.complete;}).map(function(e){return{key:e.key,reason:e.reason};})};}
  return{parseExam:parseExam,parseKp:parseKp,difficulty:difficulty,normType:normType,chartClass:chartClass,canonicalSource:canonicalSource,normalizeQuestion:normalizeQuestion,SOURCE_ALIASES:SOURCE_ALIASES,QTYPE_NAMES:QTYPE_NAMES,buildExams:buildExams,filterQuestions:filterQuestions,unitOf:unitOf,shares:shares,coverage:coverage,trend:trend,wilson:wilson,compare:compare,flagDuplicates:flagDuplicates,dataQuality:dataQuality};
});
