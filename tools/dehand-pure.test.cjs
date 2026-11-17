const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'tools/dehand.js','utf8');
class Canvas {
  constructor(w=0,h=0){this.width=w;this.height=h;}
  getContext(){
    const canvas=this;
    return{
      drawImage(){},
      getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=255;data[i+3]=255}return{data}},
      createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)}},
      putImageData(image){canvas.output=image.data},
    };
  }
}
(async()=>{
  let runs=0;
  const session={inputNames:['input'],outputNames:['out'],async run(feeds){
    const data=feeds.input.data,area=512*512;
    assert.equal(data[0],1);assert.equal(data[area],0);assert.equal(data[2*area],0);
    assert.equal(data[area-1],1,'edge padding must retain the RGB border');
    runs++;
    const output=new Float32Array(area*2);output.fill(.6,0,area);output.fill(30,area);
    return{out:{data:output}};
  }};
  const runtime={session,ort:{Tensor:class{constructor(type,data){this.data=data}}}};
  const context=vm.createContext({document:{createElement:()=>new Canvas()},console,Uint8ClampedArray,Float32Array,Int16Array,Uint8Array,URL,Promise,Math,runtime});
  const module=new vm.SourceTextModule(source+'\nsessions.set("v10-pure",Promise.resolve(runtime));removeWatermark=()=>{throw new Error("Pure mode must not remove watermarks with rules")};',{context,initializeImportMeta(meta){meta.url='https://example.test/tools/dehand.js'}});
  await module.link(()=>{throw new Error('Unexpected model download')});await module.evaluate();
  for(const [w,h,expectedWidth] of [[10,10,1240],[20,1,2480]]){
    const result=await module.namespace.cleanCanvas(new Canvas(w,h),null,{mode:'v10-pure'});
    assert.equal(result.width,expectedWidth);
    assert.equal(result.output[0],Math.round(module.namespace.printGray(.6)));
    assert.equal(result.output[3],255);
    assert.ok(result.output[0]<255,'must use reconstructed gray even when mask says handwriting');
  }
  assert.ok(runs>1);
  console.log('PASS: RGB input, edge padding, portrait/landscape widths, pure reconstruction, no colour/mask/watermark rules');
})().catch(error=>{console.error(error);process.exitCode=1});
