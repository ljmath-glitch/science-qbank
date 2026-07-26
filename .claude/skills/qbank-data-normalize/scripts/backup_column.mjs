// 用法: node backup_column.mjs <欄位名...>  (可多欄)
// 套用任何更新前，先把 id + 指定欄位全部值備份成 JSON，供回溯
import fs from 'fs';
const SUPABASE_URL='https://esfepufqyeplafzbeeag.supabase.co';
const KEY='sb_publishable_P_OpGwKYuWxpHMHCZdQRPA_1lCCLfNf';
const cols=process.argv.slice(2);
if(!cols.length){console.error('用法: node backup_column.mjs <欄位名...>');process.exit(1);}
const sel=['id',...cols].join(',');
async function fetchAll(){
  let rows=[],off=0;
  while(true){
    const url=`${SUPABASE_URL}/rest/v1/questions?select=${encodeURIComponent(sel)}&type=neq.passage&order=id&offset=${off}&limit=1000`;
    const res=await fetch(url,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});
    if(!res.ok){console.error('HTTP',res.status,await res.text());break;}
    const d=await res.json();
    if(d.length)rows=rows.concat(d);
    if(d.length<1000)break;
    off+=1000;
  }
  return rows;
}
fetchAll().then(rows=>{
  const f=`backup_${cols.join('-')}_${Date.now()}.json`;
  fs.writeFileSync(f,JSON.stringify(rows));
  console.log('已備份',rows.length,'筆到',f);
});
