// Word 匯出用的私用字元哨兵不得互相重複，也不得被底線標記處理吃掉（曾發生：ABK「選項欄數記號未完全清除」）。
const fs=require('fs'),assert=require('assert');
const h=fs.readFileSync(__dirname+'/../index.html','utf8');
const grab=name=>{const i=h.indexOf('function '+name+'(');let d=0,j=h.indexOf('{',i),k=j;for(;k<h.length;k++){if(h[k]=='{')d++;else if(h[k]=='}'){d--;if(!d)break;}}return h.slice(i,k+1)};
const lit=name=>{const m=h.match(new RegExp("const "+name+"='([^']*)'"));return m?m[1]:null};
const pick=re=>h.match(re)[0];
const consts={PRE_OPT_TAB:lit('PRE_OPT_TAB'),PRE_IMG_SENTINEL:lit('PRE_IMG_SENTINEL')};
const colm=h.match(/const PRE_OPT_COL_OPEN='([^']*)',PRE_OPT_COL_CLOSE='([^']*)'/);consts.PRE_OPT_COL_OPEN=colm[1];consts.PRE_OPT_COL_CLOSE=colm[2];
const ul=h.match(/const UL_DOUBLE_OPEN='([^']*)',UL_SINGLE_OPEN='([^']*)',UL_CLOSE='([^']*)'/);
const UL=[JSON.parse('"'+ul[1]+'"'),JSON.parse('"'+ul[2]+'"'),JSON.parse('"'+ul[3]+'"')];
const all=[...Object.values(consts),...UL];
assert.ok(all.every(x=>x&&x.length===1),'每個哨兵都必須是單一字元：'+JSON.stringify(consts));
assert.strictEqual(new Set(all).size,all.length,'哨兵字元重複：'+all.map(c=>c.charCodeAt(0).toString(16)).join(','));
// 答案哨兵（/）也要與底線標記不同
for(const c of ['',''])assert.ok(!UL.includes(c));
// 實際流程：欄數記號、圖錨點、選項 tab 經過底線處理後必須完整保留
eval(pick(/const _NEG_KW=[^\n]*\n/)+pick(/const _COUNTRIES=new RegExp\([\s\S]*?'g'\);/)+grab('_textSegs')+pick(/const UL_DOUBLE_OPEN=[^\n]*\n/)+grab('_markUnderlineKeywords')+grab('_tplApplyUnderlines')+';globalThis.M=_markUnderlineKeywords;globalThis.U=_tplApplyUnderlines;');
const text=consts.PRE_OPT_COL_OPEN+'4'+consts.PRE_OPT_COL_CLOSE+'下列敘述何者錯誤？\n'+consts.PRE_IMG_SENTINEL+'(A)甲'+consts.PRE_OPT_TAB+'(B)美國';
const xml='<w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">'+M(text).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">')+'</w:t></w:r></w:p>';
const out=U(xml);
for(const [k,v] of Object.entries(consts))assert.ok(out.includes(v),k+' 被底線處理吃掉了');
assert.ok(/w:u w:val="double"/.test(out)&&/w:u w:val="single"/.test(out),'底線仍要正常產生');
assert.ok(!UL.some(c=>out.includes(c)),'底線標記不得殘留');
console.log('word sentinels: OK');
