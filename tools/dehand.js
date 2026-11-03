// 瀏覽器端筆跡去除：模型網址日後只需改這個常數。
export const DEHAND_MODEL_URL='https://tzutzu-course-system.vercel.app/models/handwriting-eraser-v10.onnx';
export const TILE_SIZE=512,OVERLAP=48,PAGE_WIDTH=1240;

export function printGray(g){return Math.max(0,Math.min(1,(g-.25)/(.88-.25)))*255}
export function tileWeight(x,y,w,h){return Math.min(1,Math.min(x+1,y+1,w-x,h-y,OVERLAP)/OVERLAP)}
export function tileStarts(length,size=TILE_SIZE,overlap=OVERLAP){if(length<=size)return[0];const step=size-overlap,out=[];for(let x=0;x<length;x+=step){out.push(Math.min(x,length-size));if(x+size>=length)break}return[...new Set(out)]}

let sessionPromise;
async function getSession(){
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{const ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.webgpu.min.mjs');ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';try{return{ort,session:await ort.InferenceSession.create(DEHAND_MODEL_URL,{executionProviders:['webgpu','wasm']})}}catch(webgpuError){console.warn('WebGPU 載入失敗，改用 WASM',webgpuError);return{ort,session:await ort.InferenceSession.create(DEHAND_MODEL_URL,{executionProviders:['wasm']})}}})();return sessionPromise
}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
const toBlob=(c,type='image/png',q)=>new Promise(r=>c.toBlob(r,type,q));
async function blobUrl(c,type,q){return URL.createObjectURL(await toBlob(c,type,q))}
async function loadImage(file){const url=URL.createObjectURL(file);try{const im=new Image();await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=url});return im}finally{URL.revokeObjectURL(url)}}
// 逐頁產生：第 1 頁畫好就先清，不用等整份 PDF 全部畫完
async function filePages(file,loadPdfJs){
  if(!/\.pdf$/i.test(file.name)){const im=await loadImage(file);const c=canvas(im.naturalWidth,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);return{count:1,get:async()=>c}}
  const pdfjs=await loadPdfJs(),doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  // intent:'print' 不靠 requestAnimationFrame：分頁切到背景時繪製才不會停住
  return{count:doc.numPages,get:async i=>{const page=await doc.getPage(i+1),vp=page.getViewport({scale:2}),c=canvas(Math.ceil(vp.width),Math.ceil(vp.height));await page.render({canvasContext:c.getContext('2d'),viewport:vp,intent:'print'}).promise;return c}}
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
  const scale=PAGE_WIDTH/source.width,w=PAGE_WIDTH,h=Math.max(1,Math.round(source.height*scale)),input=canvas(w,h),ictx=input.getContext('2d',{willReadFrequently:true});ictx.drawImage(source,0,0,w,h);const image=ictx.getImageData(0,0,w,h),_wm=removeWatermark(image),out=canvas(w,h),odata=out.getContext('2d').createImageData(w,h),sum=new Float32Array(w*h),weights=new Float32Array(w*h),runtime=await getSession(),session=runtime.session,xs=tileStarts(w),ys=tileStarts(h);let done=0;
  for(const y of ys)for(const x of xs){const tw=Math.min(TILE_SIZE,w-x),th=Math.min(TILE_SIZE,h-y),data=new Float32Array(3*TILE_SIZE*TILE_SIZE);for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const src=((y+yy)*w+x+xx)*4,v=yy*TILE_SIZE+xx;data[v]=image.data[src]/255;data[TILE_SIZE*TILE_SIZE+v]=image.data[src+1]/255;data[2*TILE_SIZE*TILE_SIZE+v]=image.data[src+2]/255}const feeds={[session.inputNames[0]]:new runtime.ort.Tensor('float32',data,[1,3,TILE_SIZE,TILE_SIZE])};const result=await runQueued(session,feeds),gray=(result.out||result[session.outputNames[0]]).data;for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){const n=(y+yy)*w+x+xx,wt=tileWeight(xx,yy,tw,th);sum[n]+=gray[yy*TILE_SIZE+xx]*wt;weights[n]+=wt}onTile&&onTile(++done,xs.length*ys.length)}
  for(let i=0;i<sum.length;i++){const v=Math.round(printGray(sum[i]/(weights[i]||1)));odata.data[i*4]=odata.data[i*4+1]=odata.data[i*4+2]=v;odata.data[i*4+3]=255}out.getContext('2d').putImageData(odata,0,0);return out
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
