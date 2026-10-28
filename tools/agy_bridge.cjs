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
function runAgy(prompt,dir){
  return new Promise((resolve,reject)=>{
    const args=['-p',prompt];if(dir)args.push('--add-dir',dir);
    const p=spawn(AGY,args,{cwd:WORKDIR,stdio:['ignore','pipe','pipe']});
    let out='',err='';const to=setTimeout(()=>{p.kill();reject(new Error('agy 逾時'));},150000);
    p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
    p.on('error',e=>{clearTimeout(to);reject(e);});
    p.on('close',c=>{clearTimeout(to);c===0||out?resolve(out.trim()):reject(new Error('agy 失敗：'+err.slice(0,200)));});
  });
}
// 把題目附圖存成暫存檔，讓 agy 用讀檔的方式看圖（data: 直接解碼，http(s) 由橋接下載）
async function saveImgs(srcs){
  if(!srcs||!srcs.length)return {dir:'',files:[]};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agy-img-'));const files=[];
  let n=0;
  for(const src of srcs.slice(0,6)){
    try{
      let buf,ext='png';
      const m=/^data:image\/(\w+);base64,(.*)$/s.exec(src);
      if(m){ext=m[1]==='jpeg'?'jpg':m[1];buf=Buffer.from(m[2],'base64');}
      else if(/^https?:\/\//.test(src)){const r=await fetch(src);if(!r.ok)continue;buf=Buffer.from(await r.arrayBuffer());const t=(r.headers.get('content-type')||'');ext=/jpeg|jpg/.test(t)?'jpg':/gif/.test(t)?'gif':/webp/.test(t)?'webp':'png';}
      else continue;
      if(buf.length>8e6)continue;
      const f=path.join(dir,'img'+(++n)+'.'+ext);fs.writeFileSync(f,buf);files.push(f);
    }catch(e){}
  }
  return {dir,files};
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
  let body='';req.on('data',d=>{body+=d;if(body.length>30e6)req.destroy();});
  req.on('end',()=>{
    let j;try{j=JSON.parse(body);}catch(e){return send(400,{error:'JSON 格式錯誤'});}
    const prompt=String(j.prompt||'').slice(0,60000);if(!prompt)return send(400,{error:'缺 prompt'});
    const imgs=Array.isArray(j.imgs)?j.imgs.filter(x=>typeof x==='string'):[];
    chain=chain.then(async()=>{
      const {dir,files}=await saveImgs(imgs);
      try{
        const full=prompt+(files.length?'\n\n題目附圖檔案（請用讀檔方式實際查看這些圖片再判斷）：\n'+files.join('\n'):'')
          +'\n\n（只根據上面內容回答。只可讀取上面列出的圖片檔，不要讀其他檔案、不要寫檔或執行任何指令。）';
        return await runAgy(full,dir);
      }finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}
    }).then(text=>send(200,{text}),e=>send(500,{error:String(e.message||e)}));
  });
}).listen(PORT,'127.0.0.1',()=>{
  console.log('agy 橋接已啟動：http://127.0.0.1:'+PORT);
  // 組出「連線碼」（網址＋token）並複製到剪貼簿，網頁貼一次就完成設定
  const TS='/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  require('child_process').execFile(TS,['status','--json'],(e,out)=>{
    let url='';try{const dns=JSON.parse(out).Self.DNSName.replace(/\.$/,'');url='https://'+dns;}catch(x){}
    if(!url){console.log('\n抓不到 Tailscale 網址（Tailscale 有登入嗎？）。Token：'+token);return;}
    const code=Buffer.from(JSON.stringify({url,token})).toString('base64');
    console.log('\n連線碼（已複製到剪貼簿，回網頁貼上即可）：\n'+code+'\n');
    try{const c=require('child_process').spawn('pbcopy');c.stdin.end(code);}catch(x){}
    console.log('這個視窗請保持開著；要關閉橋接就關掉視窗。');
  });
});
