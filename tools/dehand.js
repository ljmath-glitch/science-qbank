// 俊瑋 v10 的瀏覽器流程：灰階複製為三通道 → 512/48 重疊 tile → 輸出第 0
// 通道 → (g-.25)/(.88-.25) 的列印對比。模型是以這個輸入分布訓練；不可把
// 紅、藍筆的 RGB 三色直接送進去，否則紅筆會被當成未見過的色彩而嚴重漏擦。
export const DEHAND_MODEL_URL=new URL('./models/handwriting-eraser-v10.onnx',import.meta.url).href;
export const DEHAND_FALLBACK_URL='https://tzutzu-course-system.vercel.app/models/handwriting-eraser-v10.onnx';
export const DEHAND_EXPERIMENTAL_MODEL_URL=new URL('./models/jwmask-r8.onnx',import.meta.url).href;
export const HAND_TH=.10;   // 筆跡機率門檻（OCR 端 clean_pdf 同值）
export const TILE_SIZE=512,OVERLAP=48,PAGE_WIDTH=1240;

export function printGray(g){return Math.max(0,Math.min(1,(g-.25)/(.88-.25)))*255}
export function tileWeight(x,y,w,h){return Math.min(1,Math.min(x+1,y+1,w-x,h-y,OVERLAP)/OVERLAP)}
export function tileStarts(length,size=TILE_SIZE,overlap=OVERLAP){if(length<=size)return[0];const step=size-overlap,out=[];for(let x=0;x<length;x+=step){out.push(Math.min(x,length-size));if(x+size>=length)break}return[...new Set(out)]}

const sessions=new Map;
async function getSession(mode='v10'){
  if(sessions.has(mode))return sessions.get(mode);
  const model=mode==='r8'?DEHAND_EXPERIMENTAL_MODEL_URL:DEHAND_MODEL_URL;
  const promise=(async()=>{const ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.webgpu.min.mjs');ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';try{return{ort,session:await ort.InferenceSession.create(model,{executionProviders:['webgpu','wasm']}).catch(()=>mode==='v10'?ort.InferenceSession.create(DEHAND_FALLBACK_URL,{executionProviders:['webgpu','wasm']}):Promise.reject(new Error('r8 模型無法載入')))}}catch(webgpuError){console.warn('WebGPU 載入失敗，改用 WASM',webgpuError);return{ort,session:await ort.InferenceSession.create(model,{executionProviders:['wasm']})}}})();sessions.set(mode,promise);try{return await promise}catch(e){sessions.delete(mode);throw e}
}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
const toBlob=(c,type='image/png',q)=>new Promise(r=>c.toBlob(r,type,q));
async function blobUrl(c,type,q){return URL.createObjectURL(await toBlob(c,type,q))}
async function loadImage(file){const url=URL.createObjectURL(file);try{const im=new Image();await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=url});return im}finally{URL.revokeObjectURL(url)}}
// 橫掃的頁先轉正（去筆跡模型是在正向考卷上學的；橫著的頁圖的細線會被當筆跡擦掉）。不靠 OCR：
// 1. 橫書的字讓「逐列墨量」起伏大、直的（轉了 90°）讓「逐欄墨量」起伏大 → 判斷要不要轉；
// 2. 卷頭標題字粗、墨多，頁尾頁碼墨少 → 兩側邊條墨量多的那側是上方，決定順時針或逆時針。
// 圖的保護區：二值化後找連通塊，字是一堆小塊，圖的座標軸＋曲線會連成一大塊（寬、高都 > 頁寬 6%）。
// 回傳每個像素的門檻陣列：圖內（外擴 4%）要筆跡機率 > 0.5 才擦（同 OCR 端 apply.py hand 模式）
export function figureThreshold(gray,w,h,base,fig=.5){
  const s=4,W=Math.ceil(w/s),H=Math.ceil(h/s),lab=new Int32Array(W*H).fill(-1),th=new Float32Array(w*h).fill(base);
  const ink=i=>{const x0=(i%W)*s,y0=((i/W)|0)*s;for(let y=y0;y<Math.min(h,y0+s);y++)for(let x=x0;x<Math.min(w,x0+s);x++)if(gray[y*w+x]<200)return true;return false};   // 4×4 格內有任何墨就算：座標軸、淡曲線、刻度連成一塊（圖線常很淡，石牌 pH 曲線約 177）   // 掃描的圖線常很淡（石牌 pH 曲線灰階約 177）
  const stack=[],m=Math.round(w*.04);let id=0;
  for(let i=0;i<W*H;i++){if(lab[i]>=0||!ink(i))continue;let x0=W,y0=H,x1=0,y1=0;stack.push(i);lab[i]=id;
    while(stack.length){const k=stack.pop(),x=k%W,y=(k/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const n=yy*W+xx;if(lab[n]<0&&ink(n)){lab[n]=id;stack.push(n)}}}
    id++;
    if((x1-x0)*s>w*.05&&(y1-y0)*s>w*.05&&(x1-x0)*s<w*.9){const X0=Math.max(0,x0*s-m),X1=Math.min(w,x1*s+m),Y0=Math.max(0,y0*s-m),Y1=Math.min(h,y1*s+m);for(let y=Y0;y<Y1;y++)th.fill(fig,y*w+X0,y*w+X1)}}
  return th}
export function sideways(gray,w,h){
  const rows=new Float64Array(h),cols=new Float64Array(w);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const d=gray[y*w+x]<128?1:0;rows[y]+=d;cols[x]+=d}
  const spread=a=>{let m=0;for(const v of a)m+=v;m/=a.length;let s=0;for(const v of a)s+=(v-m)*(v-m);return Math.sqrt(s/a.length)/(m||1)};
  if(spread(cols)<spread(rows)*1.3)return 0;              // 橫書：不轉
  const band=Math.max(4,Math.round(w*.12));let L=0,R=0;for(let x=0;x<band;x++){L+=cols[x];R+=cols[w-1-x]}
  return L>=R?90:-90                                        // 標題在左側＝頁面被逆時針轉了，要順時針轉回
}
function uprightCanvas(c){
  const W=c.width,H=c.height,s=Math.min(1,400/Math.max(W,H)),w=Math.max(1,Math.round(W*s)),h=Math.max(1,Math.round(H*s)),t=canvas(w,h),tc=t.getContext('2d',{willReadFrequently:true});
  tc.drawImage(c,0,0,w,h);const d=tc.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);for(let i=0;i<g.length;i++)g[i]=(d[i*4]*.299+d[i*4+1]*.587+d[i*4+2]*.114)|0;
  const deg=sideways(g,w,h);if(!deg)return c;
  const o=canvas(H,W),oc=o.getContext('2d');oc.translate(H/2,W/2);oc.rotate(deg*Math.PI/180);oc.drawImage(c,-W/2,-H/2);return o
}
// 逐頁產生：第 1 頁畫好就先清，不用等整份 PDF 全部畫完
async function filePages(file,loadPdfJs){
  if(!/\.pdf$/i.test(file.name)){const im=await loadImage(file);const c=canvas(im.naturalWidth,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);return{count:1,get:async()=>c}}
  const pdfjs=await loadPdfJs(),doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  // intent:'print' 不靠 requestAnimationFrame：分頁切到背景時繪製才不會停住
  return{count:doc.numPages,get:async i=>{const page=await doc.getPage(i+1),vp=page.getViewport({scale:3}),c=canvas(Math.ceil(vp.width),Math.ceil(vp.height));await page.render({canvasContext:c.getContext('2d'),viewport:vp,intent:'print'}).promise;return uprightCanvas(c)}}
}
// 校徽彩色浮水印：同 OCR 端 pyexam.remove_color_ink。整頁彩色像素 >5% 才啟動（一般考卷不會動）。
// 彩色像素改用亮度 V（淺色浮水印變白、疊在上面的暗字留著）；灰色校徽中灰（150~235）塗白，但黑字周圍 2px 不動。
export function removeWatermark(img){const d=img.data,n=img.width*img.height,col=new Uint8Array(n);let cnt=0,x0=img.width,y0=img.height,x1=0,y1=0;
  for(let i=0;i<n;i++){const r=d[i*4],g=d[i*4+1],b=d[i*4+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx&&(mx-mn)*255/mx>=45){col[i]=1;cnt++;const x=i%img.width,y=(i/img.width)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
  // A coloured school emblem normally has a neutral-grey companion.  Remember
  // its bounding region for the *output* pass: v10 redraws black print, so we
  // can remove that pale overlay without merely converting it to grey.
  if(cnt/n<=.05)return null;
  const pad=Math.round(Math.min(img.width,img.height)*.015),mask=new Uint8Array(n);x0=Math.max(0,x0-pad);x1=Math.min(img.width-1,x1+pad);y0=Math.max(0,y0-pad);y1=Math.min(img.height-1,y1+pad);
  for(let y=y0;y<=y1;y++)mask.fill(1,y*img.width+x0,y*img.width+x1+1);
  return mask}
// 浮水印區內保留印刷字：浮水印是半透明疊在字上，字會變灰（64~160），不能用「暗於 110 才留」判斷。
// 改用局部對比：灰階閉運算（細於 2R+1 的暗線會被填掉）估背景，背景比該點亮很多＝細筆畫＝字；大塊校徽色塊、平滑底色不是字。
function morph(src,w,h,y0,y1,R,isMax){const tmp=new Float32Array(src.length),out=new Float32Array(src.length),pick=isMax?Math.max:Math.min,init=isMax?-1:1e9;
  for(let y=y0;y<=y1;y++){const row=y*w;for(let x=0;x<w;x++){let m=init;const a=Math.max(0,x-R),b=Math.min(w-1,x+R);for(let k=a;k<=b;k++)m=pick(m,src[row+k]);tmp[row+x]=m}}
  for(let y=y0;y<=y1;y++){const a=Math.max(y0,y-R),b=Math.min(y1,y+R);for(let x=0;x<w;x++){let m=init;for(let k=a;k<=b;k++)m=pick(m,tmp[k*w+x]);out[y*w+x]=m}}
  return out}
export function watermarkText(img,mask){const w=img.width,h=img.height,n=w*h,L=new Float32Array(n);let y0=h,y1=-1;
  for(let i=0;i<n;i++){L[i]=.299*img.data[i*4]+.587*img.data[i*4+1]+.114*img.data[i*4+2]}
  for(let y=0;y<h;y++){if(mask.subarray(y*w,y*w+w).some(Boolean)){if(y<y0)y0=y;y1=y}}
  const R=6,bg=morph(morph(L,w,h,y0,y1,R,true),w,h,y0,y1,R,false),val=new Uint8Array(n).fill(255),text=new Uint8Array(n);
  for(let i=0;i<n;i++){if(!mask[i])continue;const c=bg[i]-L[i];if(c>=22&&L[i]<225&&bg[i]>85){const norm=Math.min(255,L[i]*255/bg[i]);val[i]=Math.round(norm*.55);text[i]=1}}
  return{val,text}}
// 同一份 PDF 的每一頁浮水印位置相同：多頁逐像素取最亮值＝「浮水印＋白紙」底圖，字在不同頁位置不同會被取掉。
// 之後每頁用 灰階/底圖 的比值還原字，浮水印不管多深都會被抵消，字不會被當成浮水印洗掉。
async function pageLum(source){const w=PAGE_WIDTH,h=Math.max(1,Math.round(source.height*w/source.width)),c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(source,0,0,w,h);const im=x.getImageData(0,0,w,h),n=w*h,L=new Uint8Array(n);for(let i=0;i<n;i++)L[i]=.299*im.data[i*4]+.587*im.data[i*4+1]+.114*im.data[i*4+2];return{L,w,h,wm:!!removeWatermark(im)}}
function buildWmBg(list){const ok=list.filter(p=>p&&p.wm);if(ok.length<2)return null;const{w,h}=ok[0];const same=ok.filter(p=>p.w===w&&p.h===h);if(same.length<2)return null;const n=w*h,bg=new Uint8Array(n);for(const p of same)for(let i=0;i<n;i++)if(p.L[i]>bg[i])bg[i]=p.L[i];
  const tmp=new Uint8Array(n),out=new Uint8Array(n);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=0;for(let k=Math.max(0,x-2);k<=Math.min(w-1,x+2);k++)m=Math.max(m,bg[y*w+k]);tmp[y*w+x]=m}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=0;for(let k=Math.max(0,y-2);k<=Math.min(h-1,y+2);k++)m=Math.max(m,tmp[k*w+x]);out[y*w+x]=m}return{bg:out,w,h}}
function watermarkRatio(img,mask,bg){const n=img.width*img.height,val=new Uint8Array(n).fill(255),text=new Uint8Array(n);for(let i=0;i<n;i++){if(!mask[i])continue;const L=.299*img.data[i*4]+.587*img.data[i*4+1]+.114*img.data[i*4+2],b=bg[i];if(b>70&&L<b*.68){val[i]=Math.round(Math.min(255,L*255/b)*.5);text[i]=1}}return{val,text}}
// WebGPU session 不能同時跑兩個 run（連續丟兩份檔會報 Session already started）：排隊一個一個跑
let runChain=Promise.resolve();
function runQueued(session,feeds){const p=runChain.then(()=>session.run(feeds));runChain=p.catch(()=>{});return p}
export async function cleanCanvas(source,onTile,{mode='v10',wmBg=null}={}){
  const scale=PAGE_WIDTH/source.width,w=PAGE_WIDTH,h=Math.max(1,Math.round(source.height*scale)),input=canvas(w,h),ictx=input.getContext('2d',{willReadFrequently:true});ictx.drawImage(source,0,0,w,h);const image=ictx.getImageData(0,0,w,h),wm=removeWatermark(image),wmt=wm?(wmBg&&wmBg.w===w&&wmBg.h===h?watermarkRatio(image,wm,wmBg.bg):watermarkText(image,wm)):null,out=canvas(w,h),odata=out.getContext('2d').createImageData(w,h),sum=new Float32Array(w*h),hand=new Float32Array(w*h),weights=new Float32Array(w*h),runtime=await getSession(mode),session=runtime.session,xs=tileStarts(w),ys=tileStarts(h);let done=0;
  for(const y of ys)for(const x of xs){const tw=Math.min(TILE_SIZE,w-x),th=Math.min(TILE_SIZE,h-y),data=new Float32Array(3*TILE_SIZE*TILE_SIZE);for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const src=((y+yy)*w+x+xx)*4,v=yy*TILE_SIZE+xx,g=(.299*image.data[src]+.587*image.data[src+1]+.114*image.data[src+2])/255;data[v]=data[TILE_SIZE*TILE_SIZE+v]=data[2*TILE_SIZE*TILE_SIZE+v]=g}const feeds={[session.inputNames[0]]:new runtime.ort.Tensor('float32',data,[1,3,TILE_SIZE,TILE_SIZE])};const result=await runQueued(session,feeds),raw=(result.out||result[session.outputNames[0]]).data,TT=TILE_SIZE*TILE_SIZE;for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const n=(y+yy)*w+x+xx,wt=tileWeight(xx,yy,tw,th),k=yy*TILE_SIZE+xx;sum[n]+=raw[k]*wt;if(raw.length>=2*TT)hand[n]+=1/(1+Math.exp(-Math.max(-30,Math.min(30,raw[TT+k]))))*wt;weights[n]+=wt}onTile&&onTile(++done,xs.length*ys.length)}
  // 只在 1240 寬上「判斷」要擦哪裡；輸出在原解析度上只塗白要擦的像素、其餘保留原圖（字不會被模型重畫而變糊）
  const erase=new Uint8Array(w*h),wmv=new Int16Array(w*h).fill(-1);
  for(let i=0;i<sum.length;i++){const r=image.data[i*4],g=image.data[i*4+1],b=image.data[i*4+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),orig=.299*r+.587*g+.114*b,colour=mx>=170&&mx<245&&mx-mn>Math.max(18,mx*.10),model=hand[i]/(weights[i]||1)>.48,redraw=printGray(sum[i]/(weights[i]||1));let keep=false;if(wm&&wm[i]){wmv[i]=wmt.val[i];keep=wmt.text[i]===1}
    if(!keep&&(colour||model||(orig<200&&redraw>235)))erase[i]=1}
  const W=source.width,H=source.height,full=canvas(W,H),fctx=full.getContext('2d',{willReadFrequently:true});fctx.drawImage(source,0,0);const fd=fctx.getImageData(0,0,W,H),d=fd.data,sx=w/W,sy=h/H;
  for(let Y=0;Y<H;Y++){const yy=Math.min(h-1,(Y*sy)|0);for(let X=0;X<W;X++){const k=yy*w+Math.min(w-1,(X*sx)|0),o=(Y*W+X)*4;let v;
    if(erase[k])v=255;else if(wmv[k]>=0&&!(wmt&&wmt.text[k]))v=wmv[k];else v=Math.round(printGray((.299*d[o]+.587*d[o+1]+.114*d[o+2])/255));
    d[o]=d[o+1]=d[o+2]=v;d[o+3]=255}}
  fctx.putImageData(fd,0,0);return full
}
async function pdfFromCanvases(pages){const {PDFDocument}=await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm'),pdf=await PDFDocument.create();for(const pg of pages){const c=pg.canvas||pg,blob=pg.blob&&pg.blobOf===c?pg.blob:await toBlob(c,'image/jpeg',.92),png=await pdf.embedJpg(await blob.arrayBuffer()),p=pdf.addPage([c.width,c.height]);p.drawImage(png,{x:0,y:0,width:c.width,height:c.height})}return new Blob([await pdf.save()],{type:'application/pdf'})}
export function preload(mode='v10'){return getSession(mode).catch(e=>{console.warn('模型預載失敗',e)})}
export async function cleanFile(file,{loadPdfJs,onProgress,onPage,mode='v10'}={}){const began=performance.now(),el=()=>((performance.now()-began)/1000).toFixed(1);let total=0;const emit=(stage,percent,page=0,message='')=>onProgress&&onProgress({stage,percent,page,total,message,elapsed:el()}),src=await (emit('讀取檔案',2,0,'正在讀取檔案'),filePages(file,loadPdfJs));total=src.count;const pages=[];
  emit('載入模型',8,0,'正在載入去筆跡模型');await getSession(mode);emit('逐頁轉影像',14,0,`共 ${total} 頁，準備轉為影像`);
  // 流水線：清第 i 頁時，第 i+1 頁已在繪製、第 i-1 頁還在編 JPEG；onPage 仍照頁序觸發
  let wmBg=null;if(total>=2&&total<=40&&/\.pdf$/i.test(file.name)){emit('分析浮水印',10,0,'正在分析各頁浮水印');const lums=[];for(let i=0;i<total;i++){try{lums.push(await pageLum(await src.get(i)))}catch(e){lums.push(null)}}wmBg=buildWmBg(lums)}
  let next=src.get(0),shown=Promise.resolve();
  for(let i=0;i<total;i++){emit('逐頁轉影像',14+i/total*12,i+1,`正在轉換第 ${i+1}/${total} 頁`);const source=await next;if(i+1<total)next=src.get(i+1);const beforeP=blobUrl(source,'image/jpeg',.8),
    clean=await cleanCanvas(source,(n,t)=>emit('逐頁清除筆跡',26+(i+n/t)/total*62,i+1,`第 ${i+1}/${total} 頁，清稿切塊 ${n}/${t}`),{mode,wmBg}),blobP=toBlob(clean,'image/jpeg',.92);
    shown=shown.then(async()=>{const blob=await blobP,page={before:await beforeP,after:URL.createObjectURL(blob),canvas:clean,blob,blobOf:clean};pages[i]=page;onPage&&onPage(page,i)})}
  await shown;
  emit('合成乾淨 PDF',92,total,'正在合成乾淨 PDF');const pdf=await pdfFromCanvases(pages);emit('合成乾淨 PDF',100,total,'乾淨 PDF 已完成');return{pages,file:new File([pdf],file.name.replace(/\.[^.]+$/,'')+'-清稿.pdf',{type:'application/pdf'})}}
export async function makePdfFromPages(pages){return pdfFromCanvases(pages)}
if(typeof window!=='undefined')window.Dehand={cleanFile,makePdfFromPages,preload,printGray,tileWeight,tileStarts};

// 頁面一打開就在背景載模型，使用者選檔時不用再等下載
if(typeof window!=='undefined')(window.requestIdleCallback||setTimeout)(()=>preload());
