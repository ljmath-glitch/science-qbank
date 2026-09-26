const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {webkit, chromium} = require('playwright');

(async () => {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch({headless:true,...(engine===chromium&&process.env.PAPER_TEST_CHROME?{executablePath:process.env.PAPER_TEST_CHROME}:{})});
    try {
      const page = await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});
      const errors = [];page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:8765/index.html?mode=test',{waitUntil:'load'});
      await page.evaluate(() => {
        DB = [
          {id:'gold-1',book:'JB3',unit:'1-1',q:'測量體積時，下列何者正確？\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]},
          {id:'gold-2',book:'JB3',unit:'1-1',groupId:'gold-g',q:'依文章判斷，何者正確？\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]},
          {id:'gold-3',book:'JB3',unit:'1-1',groupId:'gold-g',q:'哪一種量測方法較合理？\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]},
        ];
        PASSAGES['gold-g']={groupId:'gold-g',type:'passage',q:'兩位同學量測液體體積，請根據量筒的讀數回答以下問題。',imgs:[]};
        PICKS=new Set(DB.map(item=>item.id));pTitle.value='黃金模擬考驗收';pAns.value='none';
        pExamName.value='';pSubject.value='';pScope.value='';
        initPaperMetadataDefaults();pvSetPaperKind('golden');
        if(typeof WZ_SCORE!=='undefined')WZ_SCORE={single:5,group:5};
        showPaperPreview();
      });
      assert.ok(await page.locator('#pvGoldenFields').isVisible());
      assert.equal(await page.locator('#pvPreFields').isVisible(),false);
      // Source sample facts must not silently become the new exam's metadata.
      assert.ok(!(await page.locator('#pvSheet .golden-template-header').textContent()).includes('114'));
      for (const [id,value] of [['pvGoldenYear','115'],['pvGoldenSubject','理化科'],['pvGoldenExamName','八年級第一次定期考模擬試卷'],['pvGoldenVersion','綜合版'],['pvGoldenScope','第三冊 CH0～CH2-2']]) await page.locator('#'+id).fill(value);
      await page.locator('#pvGoldenSemester').selectOption('1');
      await page.waitForFunction(()=>document.querySelector('#pvSheet .golden-template-header')?.textContent.includes('115 學年度第 1 學期 理化科'));
      await page.evaluate(()=>refreshPaperEditorWhenReady());
      const geometry = await page.evaluate(() => {
        const header=document.querySelector('#pvSheet .golden-template-header');
        const logo=header.querySelector('img'),box=document.querySelector('#pvSheet .template-passage');
        const b=box.getBoundingClientRect(),area=box.closest('.pv-page-body').getBoundingClientRect();
        return {logoRatio:logo.getBoundingClientRect().width/logo.getBoundingClientRect().height,natural:logo.naturalWidth/logo.naturalHeight,
          width:b.width,areaWidth:area.width,left:b.left-area.left,right:area.right-b.right,
          watermark:getComputedStyle(document.querySelector('#pvSheet .pv-page'),'::before').content,
          columns:document.getElementById('pTwoCol').checked};
      });
      assert.ok(Math.abs(geometry.logoRatio-geometry.natural)<.01,JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.width-geometry.areaWidth)<.1&&Math.abs(geometry.left-geometry.right)<.1,JSON.stringify(geometry));
      assert.equal(geometry.columns,false);assert.equal(geometry.watermark,'none');
      assert.ok((await page.locator('#pvSheet .paper-major').first().textContent()).includes('每題＿＿分'));
      assert.ok(!(await page.locator('#pvSheet .paper-major').first().textContent()).includes('每題 5 分'));
      await page.screenshot({path:'/tmp/'+engine.name()+'-golden-editor.png'});
      await page.evaluate(()=>openPaperSettings());
      await page.waitForFunction(()=>document.getElementById('paperSettingsPreview').textContent.includes('115 學年度第 1 學期 理化科'));
      await page.locator('#pGoldenYear').fill('116');
      await page.waitForFunction(()=>document.getElementById('pvGoldenYear').value==='116'&&document.getElementById('paperSettingsPreview').textContent.includes('116 學年度'));
      const downloadPromise=page.waitForEvent('download',{timeout:60000});
      await page.evaluate(()=>downloadWordViaTemplate('golden'));
      const output='/tmp/'+engine.name()+'-golden-filled.docx';await (await downloadPromise).saveAs(output);
      execFileSync(process.env.PAPER_TEST_PYTHON||'python3',['-c',
        `import sys,zipfile
from lxml import etree as E
z=zipfile.ZipFile(sys.argv[1]);n={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
r=E.fromstring(z.read('word/document.xml'));text=''.join(r.xpath('//w:t/text()',namespaces=n))
assert all(t in text for t in ['116 學年度第 1 學期 理化科','八年級第一次定期考模擬試卷','版本：綜合版','範圍：第三冊 CH0～CH2-2','座號','姓名'])
for s in r.xpath('//w:sectPr',namespaces=n):
 assert s.find('w:pgSz',n).get('{'+n['w']+'}w')=='14570'
 assert s.find('w:pgMar',n).get('{'+n['w']+'}left')=='720'
 assert s.find('w:cols',n).get('{'+n['w']+'}num')=='1'
assert len(r.xpath('//w:numId[@w:val="100"]',namespaces=n))==3
assert len(r.xpath('//w:numId[@w:val="87"]',namespaces=n))==2
assert len(r.xpath('//w:numId[@w:val="108"]',namespaces=n))==1
assert r.find('.//wp:inline/wp:extent',n).get('cx')=='8337550'
for name in ['word/header1.xml','word/header2.xml']:
 assert not E.fromstring(z.read(name)).xpath('//w:drawing|//w:t',namespaces=n)
f=E.fromstring(z.read('word/footer1.xml'));assert 'PAGE' in ''.join(f.itertext());assert '理化' in ''.join(f.itertext())
assert '{gold_' not in text
assert '每題＿＿分' in text and '每題 5 分' not in text
print('Native header/body/PAGE, B4 single column and full-width passage: PASS')`,output]);
      // Multi-page PDF/layout uses the same header once and a footer on every page.
      const rendered=await page.evaluate(async()=>{
        paperDlg.close();DB=Array.from({length:45},(_,i)=>({id:'gold-long-'+i,q:'第 '+i+' 題：'+ '請觀察實驗中的資料，選出正確答案。'.repeat(3)+'\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]}));
        PICKS=new Set(DB.map(item=>item.id));_pvRebuild();
        const result=await buildPaperOutputPages();const pages=result.pages.map(p=>({html:paperOutputSnapshot(p).outerHTML,questions:p.querySelectorAll('.template-question').length,foot:p.querySelector('.pv-page-foot').textContent}));result.dispose();return pages;
      });
      assert.ok(rendered.length>1);assert.equal(rendered.reduce((n,p)=>n+p.questions,0),45);
      assert.equal(rendered.filter(p=>p.html.includes('golden-template-header')).length,1);
      assert.ok(rendered.every((p,i)=>p.foot===`茲茲  ${i+1}  理化`&&!p.html.includes('abk_watermark')));
      if (engine===chromium) {
        const popupPromise=page.waitForEvent('popup');
        await page.evaluate(()=>{
          const open=window.open.bind(window);
          window.open=(...args)=>{const output=open(...args);output.print=()=>{output.__printReady=true;};return output;};
          printPaperOutput();
        });
        const popup=await popupPromise;await popup.waitForFunction(()=>window.__printReady===true);
        assert.equal(await popup.locator('.template-question').count(),45);
        assert.equal(await popup.locator('.pv-page').count(),rendered.length);
        assert.equal(await popup.locator('[contenteditable],.pvq-ctrl,.noprint').count(),0);
        await popup.pdf({path:'/tmp/golden-web-full.pdf',preferCSSPageSize:true,printBackground:true});
        await popup.close();
        const longDownload=page.waitForEvent('download',{timeout:60000});
        await page.evaluate(()=>downloadWordViaTemplate('golden'));
        await (await longDownload).saveAs('/tmp/golden-web-full.docx');
      }
      await page.evaluate(()=>pvSetPaperKind('pre'));
      assert.ok(await page.locator('#pvPreFields').isVisible());
      assert.equal(await page.locator('#pvGoldenFields').isVisible(),false);
      await page.evaluate(()=>pvSetPaperKind('abk'));
      assert.ok(await page.locator('#pvAbkFields').isVisible());
      assert.deepEqual(errors,[]);
      console.log(engine.name()+': golden toolbar/settings/Word/multi-page output and type switching: PASS '+output);
    } finally {await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
