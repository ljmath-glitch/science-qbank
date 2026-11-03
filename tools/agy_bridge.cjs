#!/usr/bin/env node
/* 本機 AI 橋接：讓題庫網頁（AI 健檢、批次補齊題目明細）改用你電腦上已安裝的 AI 命令列工具，不耗 API token。
 * 支援 agy（Antigravity／Google AI Pro）、claude（Claude Code CLI）、codex（Codex CLI）；請求可指定 engine，auto 依序挑第一個有安裝的。
 * 只聽 127.0.0.1，再用 `tailscale serve` 以 HTTPS 開放給你的 tailnet；每個請求都要帶 token。
 * 用法見 docs/AGY_BRIDGE.md。 */
const http=require('http'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {spawn}=require('child_process');
const PORT=+process.env.PORT||8790;
const TOKEN_FILE=path.join(os.homedir(),'.science-qbank-bridge-token');
const AGY=process.env.AGY_BIN||path.join(os.homedir(),'.local/bin/agy');
const ALLOW=[/^https:\/\/science-qbank\.vercel\.app$/,/^http:\/\/localhost(:\d+)?$/,/^http:\/\/127\.0\.0\.1(:\d+)?$/];
const WORKDIR=fs.mkdtempSync(path.join(os.tmpdir(),'agy-bridge-'));   // 空目錄：就算 agy 想讀檔也讀不到專案
let token='';
try{token=fs.readFileSync(TOKEN_FILE,'utf8').trim();}catch(e){}
if(!token){token=crypto.randomBytes(18).toString('hex');fs.writeFileSync(TOKEN_FILE,token,{mode:0o600});}
let chain=Promise.resolve();   // 一次只跑一題，避免同時開一堆 agy
const isWin=process.platform==='win32';
const which=(cmd)=>new Promise(r=>require('child_process').execFile(isWin?'where':'which',[cmd],(e,out)=>r(e?'':String(out).split(/\r?\n/)[0].trim())));
const ENGINES={
  agy:{label:'Antigravity（agy）',bin:process.env.AGY_BIN||'agy',fallback:path.join(os.homedir(),'.local/bin/agy'),args:(prompt,dir)=>{const a=['-p',prompt];if(dir)a.push('--add-dir',dir);return a}},
  claude:{label:'Claude Code',bin:process.env.CLAUDE_BIN||'claude',args:(prompt)=>['-p',prompt]},
  codex:{label:'Codex CLI',bin:process.env.CODEX_BIN||'codex',args:(prompt,dir,outFile)=>['exec','--skip-git-repo-check','--sandbox','read-only','-o',outFile,prompt],outFile:true}
};
async function detectEngines(){const r={};for(const [k,e] of Object.entries(ENGINES)){let p=await which(e.bin);if(!p&&e.fallback&&fs.existsSync(e.fallback))p=e.fallback;r[k]={label:e.label,path:p,ok:!!p}}return r}
async function pickEngine(name){const all=await detectEngines();if(name&&name!=='auto'){if(!all[name]||!all[name].ok)throw new Error('這台電腦找不到 '+name+' 命令列工具');return [name,all[name].path]}
  for(const k of ['agy','claude','codex'])if(all[k].ok)return [k,all[k].path];throw new Error('這台電腦沒有可用的 AI 命令列工具（agy／claude／codex）');}
function runCli(name,binPath,prompt,dir){
  return new Promise((resolve,reject)=>{
    const e=ENGINES[name];const outFile=e.outFile?path.join(WORKDIR,'out-'+Date.now()+'.txt'):'';
    const p=spawn(binPath,e.args(prompt,dir,outFile),{cwd:WORKDIR,stdio:['ignore','pipe','pipe'],shell:isWin});
    let out='',err='';const to=setTimeout(()=>{p.kill();reject(new Error(name+' 逾時'));},240000);
    p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
    p.on('error',x=>{clearTimeout(to);reject(x);});
    p.on('close',c=>{clearTimeout(to);let text=out.trim();if(outFile){try{text=fs.readFileSync(outFile,'utf8').trim();fs.rmSync(outFile,{force:true})}catch(x){}}
      if(/Failed to authenticate|OAuth session expired|Please run \/login/i.test(text))return reject(new Error(name+' 尚未登入或登入已過期，請先在終端機登入該工具'));
      if(c===0||text)return resolve(text);
      const lines=err.split(/\r?\n/).filter(x=>/error|quota|unauthor|401|429|denied/i.test(x));reject(new Error(name+' 失敗：'+(lines.length?lines.slice(-2).join(' ｜ '):err.slice(-300)).slice(0,300)));});
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
function printCode(){
  // 組出「連線碼」（網址＋token）並複製到剪貼簿，網頁貼一次就完成設定
  const TS=process.platform==='darwin'?'/Applications/Tailscale.app/Contents/MacOS/Tailscale':'tailscale';
  const finish=(url,note)=>{const code=Buffer.from(JSON.stringify({url,token})).toString('base64');
    console.log('\n連線碼（已複製到剪貼簿，回網頁貼上即可）：\n'+code+'\n'+(note||''));
    try{const c=require('child_process').spawn(process.platform==='win32'?'clip':'pbcopy',{shell:process.platform==='win32'});c.stdin.end(code);}catch(x){}
    console.log('這個視窗請保持開著；要關閉橋接就關掉視窗。');};
  require('child_process').execFile(TS,['status','--json'],{shell:process.platform==='win32'},(e,out)=>{
    let url='';try{const dns=JSON.parse(out).Self.DNSName.replace(/\.$/,'');url='https://'+dns+':'+PORT;}catch(x){}
    if(url)return finish(url);
    finish('http://127.0.0.1:'+PORT,'（沒有 Tailscale：此連線碼只適用「這台電腦上的 Chrome」，Safari 會擋 http 本機位址）');
  });
}
if(process.argv.includes('--code')){printCode();return}
http.createServer((req,res)=>{
  const origin=req.headers.origin||'';
  const okOrigin=ALLOW.some(r=>r.test(origin));
  const cors={'Access-Control-Allow-Origin':okOrigin?origin:'null','Access-Control-Allow-Headers':'content-type,x-bridge-token','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Private-Network':'true','Vary':'Origin'};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  const send=(c,o)=>{res.writeHead(c,Object.assign({'content-type':'application/json; charset=utf-8'},cors));res.end(JSON.stringify(o));};
  if(!okOrigin&&origin)return send(403,{error:'origin 不允許'});
  if(req.headers['x-bridge-token']!==token)return send(401,{error:'token 不對'});
  if(req.method==='GET'&&req.url==='/ping')return send(200,{ok:true});
  if(req.method==='GET'&&req.url==='/engines')return detectEngines().then(r=>send(200,{ok:true,engines:r}));
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
        const [eng,bin]=await pickEngine(j.engine);
        return await runCli(eng,bin,full,dir);
      }finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}
    }).then(text=>send(200,{text}),e=>send(500,{error:String(e.message||e)}));
  });
}).listen(PORT,'127.0.0.1',()=>{
  console.log('agy 橋接已啟動：http://127.0.0.1:'+PORT);
  printCode();
});
