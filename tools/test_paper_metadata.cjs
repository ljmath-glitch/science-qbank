const assert = require('node:assert/strict');
const {webkit, chromium} = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch({headless:true,...(engine === chromium && process.env.PAPER_TEST_CHROME ? {executablePath:process.env.PAPER_TEST_CHROME} : {})});
    try {
      const page = await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});
      await page.goto('http://127.0.0.1:8765/index.html?mode=test',{waitUntil:'load'});
      await page.evaluate(() => {
        DB = [{id:'metadata-1',book:'JB3',unit:'1-1',type:'選',q:'測試題。\n(A)甲\n(B)乙\n(C)丙\n(D)丁',imgs:[]}];
        PICKS = new Set(DB.map(item => item.id));
        document.getElementById('pAns').value = 'none';
        document.getElementById('pTitle').value = '國八理化 第三冊';
        initPaperMetadataDefaults();
        pvSetPaperKind('abk');
        showPaperPreview();
      });
      await page.locator('#pvChapterRange').fill('1+2');
      await page.locator('#pvAbkVariant').selectOption('A');
      await page.waitForFunction(() => document.getElementById('pvSheet').textContent.includes('SCI-JB3-CH1+CH2-A'));
      assert.equal(await page.locator('#pChapterRange').inputValue(),'1+2');
      assert.equal(await page.locator('#pAbkVariant').inputValue(),'A');
      assert.equal(await page.locator('#pPaperCode').inputValue(),'SCI-JB3-CH1+CH2-A');
      await page.locator('#pvTitle').fill('國九理化 第五冊');
      await page.waitForFunction(() => document.getElementById('pBookCode').value === 'JB5');
      await page.evaluate(() => openPaperSettings());
      await page.locator('#pAbkVariant').selectOption('K');
      await page.locator('#pChapterRange').fill('CH2-1+CH2-2');
      await page.waitForFunction(() => document.getElementById('paperSettingsPreview').textContent.includes('SCI-JB5-CH2-1+CH2-2-K'));
      assert.equal(await page.locator('#pvAbkVariant').inputValue(),'K');
      assert.equal(await page.locator('#pvChapterRange').inputValue(),'CH2-1+CH2-2');
      // Also check default selection of both documents retains the real question-page header.
      await page.evaluate(() => {document.getElementById('pAns').value='both_full';refreshPaperSettingsPreview();});
      await page.waitForFunction(() => document.getElementById('paperSettingsPreview').textContent.includes('SCI-JB5-CH2-1+CH2-2-K'));
      const checks = await page.evaluate(() => {
        const meta = readPaperTemplateMetadata(true);
        const running = _pvRunningHeader();
        document.getElementById('pChapterRange').value = 'not a chapter';
        let rejected=false;try{readPaperTemplateMetadata(true);}catch(_){rejected=true;}
        document.getElementById('pChapterRange').value = 'CH2-1+CH2-2';
        return {meta,running,rejected,footer:getComputedStyle(document.getElementById('floatbar')).display};
      });
      assert.equal(checks.meta.code,'SCI-JB5-CH2-1+CH2-2-K');
      assert.ok(checks.running.includes(checks.meta.code));
      assert.ok(checks.rejected);
      assert.equal(checks.footer,'none');
      // Exercise the real DOCX export, not just an in-memory code formatter.
      const downloaded = page.waitForEvent('download',{timeout:60000});
      await page.evaluate(() => downloadWordViaTemplate('abk'));
      const download = await downloaded;
      const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'qbank-metadata-')),engine.name()+'.docx');
      await download.saveAs(output);
      const xmlCheck = await page.evaluate(async () => {
        const response = await fetch('templates/abk_tpl.docx');
        const zip = new window.PizZip(await response.arrayBuffer());
        patchAbkTemplateCode(zip,readPaperTemplateMetadata(true).code);
        return ['word/header1.xml','word/header2.xml'].map(name => {
          const xml = new DOMParser().parseFromString(zip.file(name).asText(),'application/xml');
          return {text:xml.documentElement.textContent,images:xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip').length};
        });
      });
      assert.ok(xmlCheck.every(header => header.text.includes('SCI-JB5-CH2-1+CH2-2-K') && !header.text.includes('SCI-JB3') && header.images > 0));
      // Validate the actual generated package with Python's standard zip reader.
      const {execFileSync} = require('node:child_process');
      execFileSync(process.env.PAPER_TEST_PYTHON || 'python3',['-c',
        'import sys,zipfile,xml.etree.ElementTree as E\nz=zipfile.ZipFile(sys.argv[1])\nfor p in ["word/header1.xml","word/header2.xml"]:\n r=E.fromstring(z.read(p)); t="".join(r.itertext()); assert "SCI-JB5-CH2-1+CH2-2-K" in t and "SCI-JB3" not in t\nt="".join(E.fromstring(z.read("word/document.xml")).itertext()); assert "國九理化 第五冊" in t\n',output]);
      await page.evaluate(() => {
        document.getElementById('pSubject').value='理化';
        document.getElementById('pExamName').value='課前考06-Ch2-1';
        pvSetPaperKind('pre');
      });
      const preDownloadPromise = page.waitForEvent('download',{timeout:60000});
      await page.evaluate(() => downloadWordViaTemplate('pre'));
      const preOutput = path.join(path.dirname(output),'prequiz.docx');
      await (await preDownloadPromise).saveAs(preOutput);
      execFileSync(process.env.PAPER_TEST_PYTHON || 'python3',['-c',
        'import sys,zipfile,xml.etree.ElementTree as E\nz=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read("word/document.xml")); t="".join(r.itertext()); assert "理化" in t and "第五冊" in t and "課前考06-Ch2-1" in t and "{subject}" not in t\nns="{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"\nassert all(c.get(ns+"num")=="1" for c in r.iter(ns+"cols"))\n',preOutput]);
      console.log(engine.name()+': editor/settings synchronization, title/book inference, A/B/K code, native DOCX headers: PASS ('+output+')');
    } finally {await browser.close();}
  }
})().catch(error => {console.error(error);process.exitCode=1;});
