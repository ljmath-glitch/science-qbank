const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2] || 'raw.html','utf8');
const hosts = html.split('\n').find(line=>line.includes('const OCR_HOSTS='));
const start = html.indexOf('    async function testOcrService(){');
const end = html.indexOf('    async function runAutoOcr(',start);
assert.ok(hosts && start>=0 && end>start);
async function runCase(cached,available,mac=false) {
  const store = new Map(cached ? [['ocrLocalPort',cached]] : []);
  const elements = {ocrUrl:{value:''},ocrHealth:{textContent:''}};
  const calls=[];
  const context=vm.createContext({
    OCR_IS_MAC:mac,TypeError,AbortSignal,
    localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},
    document:{getElementById:key=>elements[key]},
    ocrHost:()=> 'local',ocrConnectHint:()=> 'unreachable',
    ocrBase:()=>elements.ocrUrl.value,
    fetch:async url=>{
      calls.push(url);
      if(!url.includes(':'+available+'/'))throw new TypeError('Failed to fetch');
      return{ok:true,status:200,json:async()=>({service:'tzutzu-ocr',host:'test'})};
    },
  });
  vm.runInContext(hosts+'\nglobalThis.selectedLocal=OCR_HOSTS.local;',context);
  elements.ocrUrl.value=context.selectedLocal;
  vm.runInContext(html.slice(start,end),context);
  await context.testOcrService();
  return{store,elements,calls,selected:context.selectedLocal};
}
(async()=>{
  const modern=await runCase(null,'8787');
  assert.equal(modern.selected,'http://127.0.0.1:8787');
  assert.equal(modern.calls.length,1);
  assert.match(modern.elements.ocrHealth.textContent,/已連線/);
  const legacy=await runCase(null,'18787');
  assert.equal(legacy.store.get('ocrLocalPort'),'18787');
  assert.equal(legacy.elements.ocrUrl.value,'http://127.0.0.1:18787');
  const upgraded=await runCase('18787','8787');
  assert.equal(upgraded.store.get('ocrLocalPort'),'8787');
  assert.match(upgraded.elements.ocrHealth.textContent,/已連線/);
  const mac=await runCase(null,'8443',true);
  assert.match(mac.selected,/^https:.*:8443$/);
  console.log('PASS: new local host, legacy fallback, upgrade fallback, Mac connection');
})().catch(error=>{console.error(error);process.exitCode=1});
