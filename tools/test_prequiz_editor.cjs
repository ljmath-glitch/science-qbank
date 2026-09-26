const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {webkit, chromium} = require('playwright');

(async () => {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch({headless:true,...(engine === chromium && process.env.PAPER_TEST_CHROME ? {executablePath:process.env.PAPER_TEST_CHROME} : {})});
    try {
      const page = await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});
      await page.goto('http://127.0.0.1:8765/index.html?mode=test',{waitUntil:'load'});
      await page.evaluate(() => {
        DB = [
          {id:'pre-single',book:'JB3',unit:'1-1',q:'體積量測何者正確？\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]},
          {id:'pre-group-1',book:'JB3',unit:'1-1',groupId:'pre-g',q:'依文章判斷，何者正確？\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]},
          {id:'pre-group-2',book:'JB3',unit:'1-1',groupId:'pre-g',q:'哪一種量測方法較合理？\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]},
        ];
        PASSAGES['pre-g'] = {groupId:'pre-g',type:'passage',q:'兩位同學分別量測液體體積，比較量筒讀數與液面高度。請根據這些觀察回答問題。'.repeat(3),imgs:[]};
        PICKS = new Set(DB.map(item=>item.id));pTitle.value='國八理化 第三冊';pAns.value='none';pExamName.value='';pSubject.value='';
        initPaperMetadataDefaults();pvSetPaperKind('pre');showPaperPreview();
      });
      await page.locator('#pvPreSubject').fill('國八理化');
      await page.locator('#pvPreBookCode').selectOption('JB3');
      await page.locator('#pvPreChapterRange').fill('CH1-1');
      await page.locator('#pvExamName').fill('課前考06-Ch1-1');
      await page.waitForFunction(()=>document.querySelector('#pvSheet .pre-header-band')?.textContent.includes('課前考06-Ch1-1'));
      assert.equal(await page.locator('#pExamName').inputValue(),'課前考06-Ch1-1');
      assert.equal(await page.locator('#pSubject').inputValue(),'國八理化');
      await page.waitForFunction(()=>document.fonts.status==='loaded');
      await page.evaluate(()=>refreshPaperEditorWhenReady());
      await page.waitForFunction(()=>document.querySelector('#pvSheet .pre-template-header>img')?.getBoundingClientRect().height>0);
      const check = () => {
        const box = document.querySelector('#pvSheet .template-passage');
        const body = box.closest('.pv-page-body');
        const b = box.getBoundingClientRect(), area = body.getBoundingClientRect();
        const logo = document.querySelector('#pvSheet .pre-template-header>img');
        return {left:b.left-area.left,right:area.right-b.right,width:b.width,bodyWidth:area.width,
          ratio:logo.getBoundingClientRect().width/logo.getBoundingClientRect().height,natural:logo.naturalWidth/logo.naturalHeight,
          name:document.querySelector('#pvSheet .pre-header-band').textContent};
      };
      const wide = await page.evaluate(check);
      assert.ok(Math.abs(wide.ratio-wide.natural)<.01,JSON.stringify(wide));
      assert.ok(Math.abs(wide.left-wide.right)<.1 && Math.abs(wide.width-wide.bodyWidth)<.1,JSON.stringify(wide));
      await page.screenshot({path:'/tmp/'+engine.name()+'-prequiz-wide-editor.png'});
      await page.setViewportSize({width:720,height:900});
      const narrow = await page.evaluate(check);
      assert.ok(Math.abs(narrow.left-narrow.right)<.1 && Math.abs(narrow.width-narrow.bodyWidth)<.1,JSON.stringify(narrow));
      await page.evaluate(()=>openPaperSettings());
      await page.locator('details').filter({has:page.locator('#pExamName')}).locator('summary').click();
      await page.locator('#pExamName').fill('課前考07-Ch1-2');
      await page.waitForFunction(()=>document.getElementById('pvExamName').value==='課前考07-Ch1-2');
      await page.waitForFunction(()=>document.getElementById('paperSettingsPreview').textContent.includes('課前考07-Ch1-2'));
      const downloadPromise = page.waitForEvent('download',{timeout:60000});
      await page.evaluate(()=>downloadWordViaTemplate('pre'));
      const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'prequiz-editor-')),engine.name()+'.docx');
      await (await downloadPromise).saveAs(output);
      execFileSync(process.env.PAPER_TEST_PYTHON || 'python3',['-c',
        'import sys,zipfile,xml.etree.ElementTree as E\nz=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read("word/document.xml")); ns={"wp":"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing","w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main","a":"http://schemas.openxmlformats.org/drawingml/2006/main","wps":"http://schemas.microsoft.com/office/word/2010/wordprocessingShape"}\nassert "課前考07-Ch1-2" in "".join(r.itertext())\nboxes=[n for n in r.findall(".//wp:inline",ns) if n.find(".//w:txbxContent",ns) is not None]; assert len(boxes)==1\nfor n in boxes:\n assert n.find("wp:extent",ns).get("cx")=="8337550"; assert n.find(".//wps:spPr/a:xfrm/a:ext",ns).get("cx")=="8337550"\n',output]);
      const printed = await page.evaluate(async () => {
        const result = await buildPaperOutputPages();
        const pages = result.pages.map(p=>paperOutputSnapshot(p).outerHTML);result.dispose();return pages;
      });
      assert.ok(printed.some(p=>p.includes('課前考07-Ch1-2')));
      assert.ok(printed.every(p=>!p.includes('abk_watermark.png')));
      // Switching back must preserve ABK's narrower box and watermark.
      await page.evaluate(()=>{paperDlg.close();pvSetPaperKind('abk');});
      assert.ok(await page.locator('#pvAbkFields').isVisible());
      assert.equal(await page.locator('#pvPreFields').isVisible(),false);
      const abk = await page.evaluate(()=>({width:document.querySelector('#pvSheet .template-passage').offsetWidth,watermark:getComputedStyle(document.querySelector('#pvSheet .pv-page'),'::before').backgroundImage}));
      assert.ok(abk.width>380 && abk.width<=417);assert.ok(abk.watermark.includes('abk_watermark.png'));
      console.log(engine.name()+': proportional prequiz logo, toolbar/settings/header name sync, full-width single-column boxes, native Word and ABK unchanged: PASS ('+output+')');
    } finally {await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
