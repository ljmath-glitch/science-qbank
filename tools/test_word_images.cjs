// Unit tests; add --browser --source-docx <path> --out <path> for real WebKit export QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const context = vm.createContext({});
const fn = source.match(/^function _tplFitImage\([^]*?^}/m);
assert.ok(fn);
vm.runInContext(fn[0], context);
vm.runInContext(source.match(/^function _imgDims\([^]*?^}/m)[0], context);
assert.throws(()=>context._imgDims(new Uint8Array([82,73,70,70])), 'Unknown formats must not receive a guessed 4:3 size');
for (const kind of ['abk', 'pre']) {
  for (const [w, h] of [[803,1024], [1024,204], [1013,1024], [20,10], [1,1024]]) {
    const [x,y] = context._tplFitImage(w,h,kind);
    assert.ok(Math.abs(x/y-w/h)<1e-10, 'Aspect ratio must not be rounded or guessed');
    assert.ok(x <= (kind==='abk'?270:460) && y <= (kind==='abk'?135:380));
    assert.ok(x<=w&&y<=h, 'Small images must not be enlarged');
  }
}
assert.throws(()=>context._tplFitImage(0,20,'abk'));
assert.throws(()=>context._tplFitImage(10,NaN,'abk'));
console.log('Word image aspect ratio and bounds: PASS');

if (process.argv.includes('--browser')) (async()=>{
  const arg = name => process.argv[process.argv.indexOf(name)+1];
  const python = '/Users/chiafuchang/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const samples = JSON.parse(execFileSync(python, ['-c',
    'from zipfile import ZipFile; import sys,json,base64,io; from PIL import Image\nz=ZipFile(sys.argv[1]); out=[]\nfor name in z.namelist():\n if name.startswith("word/media/image_generated_"):\n  raw=z.read(name); im=Image.open(io.BytesIO(raw)); out.append(dict(name=name,mime="image/"+im.format.lower(),b64=base64.b64encode(raw).decode(),width=im.width,height=im.height))\nprint(json.dumps(out))', arg('--source-docx')], {maxBuffer:20*1024*1024}));
  const {webkit} = require('playwright');
  const browser=await webkit.launch({headless:true});
  try {
    const page=await browser.newPage({acceptDownloads:true});
    await page.goto('http://127.0.0.1:8765/index.html?mode=test',{waitUntil:'load'});
    const prepared=await page.evaluate(async samples=>{
      const result=[];
      for(const sample of samples){
        const image=await _tplPrepareImage({mimeType:sample.mime,b64:sample.b64});
        const bytes=_b64ToBytes(image.src);
        const actual=_imgDims(bytes);
        if(bytes[0]!==137||actual[0]!==sample.width||actual[1]!==sample.height)throw new Error('PNG conversion mismatch: '+sample.name);
        result.push({name:sample.name,width:image.width,height:image.height});
      }
      return result;
    },samples);
    assert.equal(prepared.length,samples.length);
    const downloadPromise=page.waitForEvent('download',{timeout:60000});
    await page.evaluate(async samples=>{
      await _ensureDocxTemplater();
      const chosen=['image_generated_14.png','image_generated_17.png','image_generated_18.png'];
      const items=chosen.map((name,i)=>{
        const s=samples.find(x=>x.name.endsWith('/'+name));
        return {q:'Image proportion test '+(i+1)+': '+s.width+' x '+s.height+' pixels.\n(A)First\n(B)Second\n(C)Third\n(D)Fourth',imgs:[{src:'data:'+s.mime+';base64,'+s.b64}]};
      });
      paperQuestionSections=()=>({ordered:items,kindOf:()=> 'single'});
      pickedItems=()=>[];
      document.getElementById('pTitle').value='Image proportions';
      document.getElementById('pExamName').value='Image proportions';
      await downloadWordViaTemplate('abk');
    },samples);
    await (await downloadPromise).saveAs(arg('--out'));
    console.log('WebKit: '+samples.length+' original images decoded as PNG; portrait, wide table and chart exported.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
