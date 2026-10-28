#!/usr/bin/env node
/* 本機 Antigravity(agy) 橋接：讓題庫網頁的「AI 健檢」改用你 Mac 上的 agy（Google AI Pro 訂閱），不耗 API token。
 * 只聽 127.0.0.1，再用 `tailscale serve` 以 HTTPS 開放給你的 tailnet；每個請求都要帶 token。
 * 用法見 docs/AGY_BRIDGE.md。 */
const http=require('http'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {spawn}=require('child_process');
const PORT=+process.env.PORT||8787;
const TOKEN_FILE=path.join(os.homedir(),'.science-qbank-bridge-token');
const AGY=process.env.AGY_BIN||path.join(os.homedir(),'.local/bin/agy');
const ALLOW=[/^https:\/\/science-qbank\.vercel\.app$/,/^http:\/\/localhost(:\d+)?$/,/^http:\/\/127\.0\.0\.1(:\d+)?$/];
const WORKDIR=fs.mkdtempSync(path.join(os.tmpdir(),'agy-bridge-'));   // 空目錄：就算 agy 想讀檔也讀不到專案
let token='';
try{token=fs.readFileSync(TOKEN_FILE,'utf8').trim();}catch(e){}
if(!token){token=crypto.randomBytes(18).toString('hex');fs.writeFileSync(TOKEN_FILE,token,{mode:0o600});}
let chain=Promise.resolve();   // 一次只跑一題，避免同時開一堆 agy
function runAgy(prompt){
  return new Promise((resolve,reject)=>{
    const p=spawn(AGY,['-p',prompt],{cwd:WORKDIR,stdio:['ignore','pipe','pipe']});
    let out='',err='';const to=setTimeout(()=>{p.kill();reject(new Error('agy 逾時'));},150000);
    p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
    p.on('error',e=>{clearTimeout(to);reject(e);});
    p.on('close',c=>{clearTimeout(to);c===0||out?resolve(out.trim()):reject(new Error('agy 失敗：'+err.slice(0,200)));});
  });
}
http.createServer((req,res)=>{
  const origin=req.headers.origin||'';
  const okOrigin=ALLOW.some(r=>r.test(origin));
  const cors={'Access-Control-Allow-Origin':okOrigin?origin:'null','Access-Control-Allow-Headers':'content-type,x-bridge-token','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Private-Network':'true','Vary':'Origin'};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  const send=(c,o)=>{res.writeHead(c,Object.assign({'content-type':'application/json; charset=utf-8'},cors));res.end(JSON.stringify(o));};
  if(!okOrigin&&origin)return send(403,{error:'origin 不允許'});
  if(req.headers['x-bridge-token']!==token)return send(401,{error:'token 不對'});
  if(req.method==='GET'&&req.url==='/ping')return send(200,{ok:true});
  if(req.method!=='POST'||req.url!=='/ai')return send(404,{error:'not found'});
  let body='';req.on('data',d=>{body+=d;if(body.length>400000)req.destroy();});
  req.on('end',()=>{
    let j;try{j=JSON.parse(body);}catch(e){return send(400,{error:'JSON 格式錯誤'});}
    const prompt=String(j.prompt||'').slice(0,60000);if(!prompt)return send(400,{error:'缺 prompt'});
    const full=prompt+'\n\n（只根據上面內容回答，不要使用任何工具、不要讀寫檔案或執行指令。）';
    chain=chain.then(()=>runAgy(full)).then(text=>send(200,{text}),e=>send(500,{error:String(e.message||e)}));
  });
}).listen(PORT,'127.0.0.1',()=>{
  console.log('agy 橋接已啟動：http://127.0.0.1:'+PORT);
  console.log('Token（貼到網頁設定）：'+token);
});
