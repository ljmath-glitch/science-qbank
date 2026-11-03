// 瀏覽器端筆跡去除：模型網址日後只需改這個常數。
// 第 8 輪自訓模型（從俊瑋 v10 微調、專練「筆跡機率」通道並加圖／印刷反例）：驗證集筆跡抓到 94%、印刷誤標 9.5%、圖誤標 0.2%
// （v10：90.6%／11.9%／5.6%）。缺檔時退回俊瑋 v10 網址。
export const DEHAND_MODEL_URL=new URL('./models/jwmask-r8.onnx',import.meta.url).href;
export const DEHAND_FALLBACK_URL='https://tzutzu-course-system.vercel.app/models/handwriting-eraser-v10.onnx';
export const HAND_TH=.12;   // 筆跡機率門檻（OCR 端 clean_pdf 同值）
export const TILE_SIZE=512,OVERLAP=48,PAGE_WIDTH=1240;

export function printGray(g){return Math.max(0,Math.min(1,(g-.25)/(.88-.25)))*255}
export function tileWeight(x,y,w,h){return Math.min(1,Math.min(x+1,y+1,w-x,h-y,OVERLAP)/OVERLAP)}
export function tileStarts(length,size=TILE_SIZE,overlap=OVERLAP){if(length<=size)return[0];const step=size-overlap,out=[];for(let x=0;x<length;x+=step){out.push(Math.min(x,length-size));if(x+size>=length)break}return[...new Set(out)]}

let sessionPromise;
async function getSession(){
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{const ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.webgpu.min.mjs');ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';try{return{ort,session:await ort.InferenceSession.create(DEHAND_MODEL_URL,{executionProviders:['webgpu','wasm']}).catch(()=>ort.InferenceSession.create(DEHAND_FALLBACK_URL,{executionProviders:['webgpu','wasm']}))}}catch(webgpuError){console.warn('WebGPU 載入失敗，改用 WASM',webgpuError);return{ort,session:await ort.InferenceSession.create(DEHAND_MODEL_URL,{executionProviders:['wasm']})}}})();return sessionPromise
}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
const toBlob=(c,type='image/png',q)=>new Promise(r=>c.toBlob(r,type,q));
async function blobUrl(c,type,q){return URL.createObjectURL(await toBlob(c,type,q))}
async function loadImage(file){const url=URL.createObjectURL(file);try{const im=new Image();await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=url});return im}finally{URL.revokeObjectURL(url)}}
// 橫掃的頁先轉正（去筆跡模型是在正向考卷上學的；橫著的頁圖的細線會被當筆跡擦掉）。不靠 OCR：
// 1. 橫書的字讓「逐列墨量」起伏大、直的（轉了 90°）讓「逐欄墨量」起伏大 → 判斷要不要轉；
// 2. 卷頭標題字粗、墨多，頁尾頁碼墨少 → 兩側邊條墨量多的那側是上方，決定順時針或逆時針。
// 圖的保護區：二值化後找連通塊，字是一堆小塊，圖的座標軸＋曲線會連成一大塊（寬、高都 > 頁寬 6%）。
// 回傳每個像素的門檻陣列：圖內（外擴 4%）要筆跡機率 > 0.97 才擦（同 OCR 端 apply.py hand 模式）
export function figureThreshold(gray,w,h,base,fig=.97){
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
  return{count:doc.numPages,get:async i=>{const page=await doc.getPage(i+1),vp=page.getViewport({scale:2}),c=canvas(Math.ceil(vp.width),Math.ceil(vp.height));await page.render({canvasContext:c.getContext('2d'),viewport:vp,intent:'print'}).promise;return uprightCanvas(c)}}
}
// 校徽彩色浮水印：同 OCR 端 pyexam.remove_color_ink。整頁彩色像素 >5% 才啟動（一般考卷不會動）。
// 彩色像素改用亮度 V（淺色浮水印變白、疊在上面的暗字留著）；灰色校徽中灰（150~235）塗白，但黑字周圍 2px 不動。
export function removeWatermark(img){const d=img.data,n=img.width*img.height,col=new Uint8Array(n);let cnt=0;
  for(let i=0;i<n;i++){const r=d[i*4],g=d[i*4+1],b=d[i*4+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx&&(mx-mn)*255/mx>=45){col[i]=1;cnt++}}
  if(cnt/n<=.05)return false;
  for(let i=0;i<n;i++)if(col[i]){const v=Math.max(d[i*4],d[i*4+1],d[i*4+2]),o=v>=150?255:v;d[i*4]=d[i*4+1]=d[i*4+2]=o}
  const w=img.width,h=img.height,gray=new Uint8Array(n),dark=new Uint8Array(n),near=new Uint8Array(n);
  for(let i=0;i<n;i++){gray[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];dark[i]=gray[i]<100}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(dark[y*w+x])for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<h&&xx>=0&&xx<w)near[yy*w+xx]=1}
  for(let i=0;i<n;i++)if(gray[i]>=150&&gray[i]<=235&&!near[i])d[i*4]=d[i*4+1]=d[i*4+2]=255;
  return true}
// WebGPU session 不能同時跑兩個 run（連續丟兩份檔會報 Session already started）：排隊一個一個跑
let runChain=Promise.resolve();
function runQueued(session,feeds){const p=runChain.then(()=>session.run(feeds));runChain=p.catch(()=>{});return p}
export async function cleanCanvas(source,onTile){
  const scale=PAGE_WIDTH/source.width,w=PAGE_WIDTH,h=Math.max(1,Math.round(source.height*scale)),input=canvas(w,h),ictx=input.getContext('2d',{willReadFrequently:true});ictx.drawImage(source,0,0,w,h);const image=ictx.getImageData(0,0,w,h),_wm=removeWatermark(image),out=canvas(w,h),odata=out.getContext('2d').createImageData(w,h),sum=new Float32Array(w*h),weights=new Float32Array(w*h),hand=new Float32Array(w*h),runtime=await getSession(),session=runtime.session,xs=tileStarts(w),ys=tileStarts(h);let done=0;
  for(const y of ys)for(const x of xs){const tw=Math.min(TILE_SIZE,w-x),th=Math.min(TILE_SIZE,h-y),data=new Float32Array(3*TILE_SIZE*TILE_SIZE);for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const src=((y+yy)*w+x+xx)*4,v=yy*TILE_SIZE+xx;data[v]=image.data[src]/255;data[TILE_SIZE*TILE_SIZE+v]=image.data[src+1]/255;data[2*TILE_SIZE*TILE_SIZE+v]=image.data[src+2]/255}const feeds={[session.inputNames[0]]:new runtime.ort.Tensor('float32',data,[1,3,TILE_SIZE,TILE_SIZE])};const result=await runQueued(session,feeds),gray=(result.out||result[session.outputNames[0]]).data,TT=TILE_SIZE*TILE_SIZE;for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const n=(y+yy)*w+x+xx,wt=tileWeight(xx,yy,tw,th),k=yy*TILE_SIZE+xx;sum[n]+=gray[k]*wt;if(gray.length>=2*TT)hand[n]+=wt/(1+Math.exp(-Math.max(-30,Math.min(30,gray[TT+k]))));weights[n]+=wt}onTile&&onTile(++done,xs.length*ys.length)}
  const useHand=hand.some(v=>v>0),hit=new Uint8Array(w*h);
  if(useHand){const gray=new Uint8Array(w*h);for(let i=0;i<gray.length;i++)gray[i]=(.299*image.data[i*4]+.587*image.data[i*4+1]+.114*image.data[i*4+2])|0;const TH=figureThreshold(gray,w,h,HAND_TH);for(let i=0;i<hit.length;i++)if(hand[i]/(weights[i]||1)>TH[i]){const x=i%w,y=(i/w)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<h&&xx>=0&&xx<w)hit[yy*w+xx]=1}}}
  // hand：印刷保留原圖（不會像整頁模型輸出那樣吃掉圖的細線），只擦筆跡；色階同俊瑋打印版讓字飽滿黑
  for(let i=0;i<sum.length;i++){const g=useHand?(hit[i]?255:(.299*image.data[i*4]+.587*image.data[i*4+1]+.114*image.data[i*4+2])):sum[i]/(weights[i]||1)*255,v=Math.round(printGray(g/255));odata.data[i*4]=odata.data[i*4+1]=odata.data[i*4+2]=v;odata.data[i*4+3]=255}out.getContext('2d').putImageData(odata,0,0);return out
}
async function pdfFromCanvases(pages){const {PDFDocument}=await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm'),pdf=await PDFDocument.create();for(const pg of pages){const c=pg.canvas||pg,blob=pg.blob&&pg.blobOf===c?pg.blob:await toBlob(c,'image/jpeg',.92),png=await pdf.embedJpg(await blob.arrayBuffer()),p=pdf.addPage([c.width,c.height]);p.drawImage(png,{x:0,y:0,width:c.width,height:c.height})}return new Blob([await pdf.save()],{type:'application/pdf'})}
export function preload(){return getSession().catch(e=>{sessionPromise=null;console.warn('模型預載失敗',e)})}
export async function cleanFile(file,{loadPdfJs,onProgress,onPage}={}){const began=performance.now(),el=()=>((performance.now()-began)/1000).toFixed(1),src=await filePages(file,loadPdfJs),total=src.count,pages=[];
  // 流水線：清第 i 頁時，第 i+1 頁已在繪製、第 i-1 頁還在編 JPEG；onPage 仍照頁序觸發
  let next=src.get(0),shown=Promise.resolve();
  for(let i=0;i<total;i++){onProgress&&onProgress({page:i+1,total,message:'正在去除筆跡',elapsed:el()});const source=await next;if(i+1<total)next=src.get(i+1);const beforeP=blobUrl(source,'image/jpeg',.8),
    clean=await cleanCanvas(source,(n,t)=>onProgress&&onProgress({page:i+1,total,message:`清稿切塊 ${n}/${t}`,elapsed:el()})),blobP=toBlob(clean,'image/jpeg',.92);
    shown=shown.then(async()=>{const blob=await blobP,page={before:await beforeP,after:URL.createObjectURL(blob),canvas:clean,blob,blobOf:clean};pages[i]=page;onPage&&onPage(page,i)})}
  await shown;
  onProgress&&onProgress({page:total,total,message:'正在建立 PDF',elapsed:el()});const pdf=await pdfFromCanvases(pages);return{pages,file:new File([pdf],file.name.replace(/\.[^.]+$/,'')+'-清稿.pdf',{type:'application/pdf'})}}
export async function makePdfFromPages(pages){return pdfFromCanvases(pages)}
if(typeof window!=='undefined')window.Dehand={cleanFile,makePdfFromPages,preload,printGray,tileWeight,tileStarts};

// 頁面一打開就在背景載模型，使用者選檔時不用再等下載
if(typeof window!=='undefined')(window.requestIdleCallback||setTimeout)(()=>preload());
