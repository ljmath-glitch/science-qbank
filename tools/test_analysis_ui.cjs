const assert=require('assert'),fs=require('fs'),vm=require('vm');
const s=fs.readFileSync('analysis.html','utf8'),m=s.match(/\/\* PURE_LOGIC_START \*\/([\s\S]*?)\/\* PURE_LOGIC_END \*\//);
assert(m,'找不到純邏輯標記');
const ctx={URLSearchParams,AnalysisCore:{parseExam:(e,school)=>({category:/會考/.test(e)?'會考':'段考',school:school||''})}};vm.createContext(ctx);vm.runInContext(m[1],ctx);
const state={filters:{category:['段考'],school:['天母國中'],year:{min:111,max:114}},includeIncomplete:true,countMode:'involved',weight:'question'};
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.qsDecode(ctx.qsEncode(state)))),state);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.filterSources([{exam:'會考',school:'教育部'},{exam:'段考',school:'天母國中'},{exam:'段考',school:'士林國中'}],['段考']))),['士林國中','天母國中']);
assert(ctx.makeCsv([{a:'a,b',b:'x"y'}],[{key:'a',label:'A'},{key:'b',label:'B'}]).includes('"a,b"'));assert(ctx.makeCsv([{a:'x"y'}],[{key:'a',label:'A'}]).includes('"x""y"'));
console.log('analysis UI pure logic: OK');
