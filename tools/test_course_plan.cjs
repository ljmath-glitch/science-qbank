const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'..','course-plan.html'),'utf8');
const m=html.match(/COURSE_PLAN_PURE_FUNCTIONS_START\s*--><script>([\s\S]*?)<\/script><!-- COURSE_PLAN_PURE_FUNCTIONS_END/);
assert(m,'找不到課程規劃純函式區塊');
const ctx={};vm.createContext(ctx);vm.runInContext(m[1],ctx);
assert.equal(ctx.mapHanlinUnit({sub:'1-1 地球的起源'}),'一-1');
assert.equal(ctx.mapHanlinUnit({sub:'2-1',kp:''}),'三-1');
assert.equal(ctx.mapHanlinUnit({sub:'5-1',kp:'EEd-Ⅴc-2'}),'二-4');
assert.equal(ctx.mapHanlinUnit({sub:'3-2',kp:'EIb-Ⅴc-4'}),'五-4');
assert.equal(ctx.mapHanlinUnit({sub:'6-2',kp:''}),'六-3');
assert.equal(ctx.mapHanlinUnit({sub:'x'}),'未分類');
const rows=[
 {exam:'111學測',sub:'1-1',type:'A2',step:2,mem:2,con:2},
 {exam:'112學測',sub:'1-1',type:'B2',step:3,mem:2,con:2},
 {exam:'113學測',sub:'2-2',type:'passage'},
 {exam:'114北模E2',sub:'2-2',type:'E2',step:3,mem:2,con:3}
];
assert.equal(ctx.filteredQuestions(rows,'學測','111','115').length,2);
assert.equal(ctx.filteredQuestions(rows,'北模','','').length,1);
assert.equal(ctx.questionDifficulty(rows[0]),6);
const stats=ctx.unitStats(rows.filter(x=>x.type!=='passage'),['111','112','113','114'],'一');
assert.equal(stats.total,2);assert.equal(stats.byYear['111'],1);
assert.equal(ctx.trendArrow(8,4),'↑');assert.equal(ctx.trendArrow(1,5),'↓');assert.equal(ctx.pct(1,4),25);
console.log('course-plan pure-function tests passed');
