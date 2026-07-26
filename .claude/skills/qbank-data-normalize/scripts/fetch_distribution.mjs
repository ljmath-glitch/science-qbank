// 用法: node fetch_distribution.mjs <欄位名> [允許值以逗號分隔]
// 撈 questions 全表（不含 passage），印出該欄位的值分布；有給允許值清單時標出「不在清單內」的值
const SUPABASE_URL='https://esfepufqyeplafzbeeag.supabase.co';
const KEY='sb_publishable_P_OpGwKYuWxpHMHCZdQRPA_1lCCLfNf';
const col=process.argv[2];
const allow=(process.argv[3]||'').split(',').map(s=>s.trim()).filter(Boolean);
if(!col){console.error('用法: node fetch_distribution.mjs <欄位名> [允許值,逗號分隔]');process.exit(1);}
async function fetchAll(){
  let rows=[],off=0;
  while(true){
    const url=`${SUPABASE_URL}/rest/v1/questions?select=id,${encodeURIComponent(col)}&type=neq.passage&order=id&offset=${off}&limit=1000`;
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
  const c={};
  rows.forEach(r=>{let v=r[col];v=(v==null?'(null)':String(v).trim())||'(空白)';c[v]=(c[v]||0)+1;});
  const pairs=Object.entries(c).sort((a,b)=>b[1]-a[1]);
  console.log('total rows:',rows.length,'| distinct values:',pairs.length);
  const allowSet=new Set(allow);
  let bad=0;
  pairs.forEach(([v,n])=>{
    const flag=allow.length&&!allowSet.has(v)?'  <-- 不在允許清單':'';
    if(flag)bad+=n;
    console.log(String(n).padStart(6),v+flag);
  });
  if(allow.length)console.log('\n不符合允許清單的總筆數:',bad);
});
