const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');

const [pdf, output, existingJob] = process.argv.slice(2);
const base = 'http://127.0.0.1:8787';
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function request(endpoint, data) {
  const response = await fetch(base+endpoint, {
    method: data ? 'POST' : 'GET',
    headers: data ? {'content-type':'application/json'} : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.ok !== false, JSON.stringify(body));
  return body;
}
async function poll(endpoint) {
  const start = Date.now();
  while (Date.now()-start < 8*60*1000) {
    const result = await request(endpoint);
    if(result.done) return result;
    await delay(2000);
  }
  throw new Error('Smoke test timed out: '+endpoint);
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const health = await request('/api/health');
  assert.equal(health.service,'tzutzu-ocr');
  assert.ok(health.installId,'Service must identify its installation');
  console.log('HEALTH PASS '+health.installId);
  const dataBase64 = (await fs.readFile(pdf)).toString('base64');
  const started = existingJob ? {jobId:existingJob} : await request('/api/py-ocr/start',{
    filename:path.basename(pdf),dataBase64,skipClean:true,skipWord:true,
  });
  console.log('OCR START '+started.jobId);
  const result = await poll('/api/py-ocr/progress?job='+encodeURIComponent(started.jobId));
  assert.ok(result.text && result.text.length>30,'OCR text is missing');
  assert.ok(result.qbankUrl,'Excel URL is missing');
  const excel = await fetch(base+result.qbankUrl,{signal:AbortSignal.timeout(120000)});
  if (!excel.ok) throw new Error('Excel HTTP '+excel.status+': '+await excel.text());
  await fs.writeFile(path.join(output,'smoke.xlsx'),Buffer.from(await excel.arrayBuffer()));
  console.log('OCR AND EXCEL PASS, characters '+result.text.length);
  const crop = await request('/api/py-ocr/figcrop',{dataBase64,job:result.job,async:true});
  const cropped = await poll('/api/py-ocr/figcrop-status?id='+encodeURIComponent(crop.cropJob));
  assert.ok(Array.isArray(cropped.pages)&&cropped.pages.length>0);
  const figures = cropped.pages.flatMap(page=>page.items||[]);
  for (const figure of figures) assert.ok(figure.png && figure.w>0 && figure.h>0);
  await fs.writeFile(path.join(output,'smoke-result.json'),JSON.stringify({
    installId:health.installId,textLength:result.text.length,figureCount:figures.length,ok:true,
  },null,2));
  console.log('AUTO CROP PASS, figures '+figures.length);
})().catch(error=>{console.error(error);process.exitCode=1;});
