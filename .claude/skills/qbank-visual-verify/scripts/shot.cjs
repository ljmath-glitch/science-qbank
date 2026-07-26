// 用法: node shot.cjs <html檔> <輸出png> [寬度=1200] [fullPage:0/1=1] [mock資料json]
// 開啟本機題庫 HTML、stub 掉 supabase、擋外部網路後截圖。
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, file, out, width='1200', full='1', rowsFile] = process.argv;
if(!file || !out){ console.error('用法: node shot.cjs <html檔> <輸出png> [寬度] [fullPage:0/1] [mock資料json]'); process.exit(1); }
const rows = rowsFile && fs.existsSync(rowsFile) ? JSON.parse(fs.readFileSync(rowsFile,'utf8')) : [];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: parseInt(width)||1200, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((rowsJson) => {
    const ROWS = JSON.parse(rowsJson);
    try { localStorage.setItem('ib_unlocked','1'); } catch(e){}
    function mk(){
      const st = {};
      const b2 = {
        select(_,o){ if(o&&o.head) st.head=true; return b2; },
        neq(c,v){ st.c=c; st.v=v; return b2; },
        eq(){ return b2; }, order(){ return b2; }, limit(){ return b2; },
        maybeSingle(){ return Promise.resolve({data:null,error:null}); },
        single(){ return Promise.resolve({data:null,error:null}); },
        upsert(r){ return Promise.resolve({data:[].concat(r),error:null}); },
        range(f,t){ let d=ROWS.slice(); if(st.c) d=d.filter(r=>r[st.c]!==st.v); return Promise.resolve({data:d.slice(f,t+1),error:null,count:ROWS.length}); },
        then(res){ return Promise.resolve({count:ROWS.length,data:[],error:null}).then(res); }
      };
      return b2;
    }
    window.supabase = { createClient: () => ({ from: () => mk(), channel: () => { const c={on:()=>c,subscribe:()=>c}; return c; } }) };
  }, JSON.stringify(rows));
  await p.route('**', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await p.goto('file://' + require('path').resolve(file), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: out, fullPage: full === '1' });
  console.log('page errors:', errs.slice(0,6));
  console.log('screenshot ->', out);
  await b.close();
})();
