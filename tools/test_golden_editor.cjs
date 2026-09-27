const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {webkit, chromium} = require('playwright');

(async () => {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch({headless:true,...(engine===chromium&&process.env.PAPER_TEST_CHROME?{executablePath:process.env.PAPER_TEST_CHROME}:{})});
    try {
      const page = await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});
      await page.context().addInitScript(()=>{window.print=()=>{window.__printReady=true;};});
      const errors = [];page.on('pageerror',error=>errors.push(error.message));
      // Keep this fixture isolated from production and wait for boot. A late
      // cloud load must not replace the 45-question fixture before Word export.
      await page.route('https://*.supabase.co/**',route=>route.fulfill({status:200,
        contentType:'application/json',headers:{'content-range':'0-0/0',
          'access-control-allow-origin':'*','access-control-expose-headers':'content-range',
          'access-control-allow-headers':'*','access-control-allow-methods':'GET,HEAD,POST,PATCH,DELETE,OPTIONS'},body:'[]'}));
      await page.goto('http://127.0.0.1:8765/index.html?mode=test',{waitUntil:'load'});
      await page.waitForFunction(()=>window.__qbankDataReady===true);
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
      await page.evaluate(()=>refreshPaperEditorWhenReady());
      // Source sample facts must not silently become the new exam's metadata.
      assert.ok(!(await page.locator('#pvSheet .golden-template-header').textContent()).includes('114'));
      for (const [id,value] of [['pvGoldenYear','115'],['pvGoldenSubject','理化科'],['pvGoldenExamName','八年級第一次定期考模擬試卷'],['pvGoldenVersion','綜合版'],['pvGoldenScope','第三冊 CH0～CH2-2']]) {
        await page.locator('#'+id).fill(value);
        await page.waitForFunction(({id,value})=>document.getElementById(id).value===value,{id,value});
      }
      await page.locator('#pvGoldenSemester').selectOption('1');
      await page.waitForFunction(()=>document.querySelector('#pvSheet .golden-template-header')?.textContent.includes('115 學年度第 1 學期 理化科')).catch(async error=>{
        console.error('Browser errors:',errors);
        console.error(await page.evaluate(()=>({header:document.querySelector('#pvSheet .golden-template-header')?.textContent,
          values:['pGoldenYear','pvGoldenYear','pGoldenSemester','pSubject'].map(id=>[id,document.getElementById(id).value]),picked:pickedItems().length})));
        throw error;
      });
      await page.evaluate(()=>refreshPaperEditorWhenReady());
      const geometry = await page.evaluate(() => {
        const header=document.querySelector('#pvSheet .golden-template-header');
        const logo=header.querySelector('img'),box=document.querySelector('#pvSheet .template-passage');
        const b=box.getBoundingClientRect(),area=box.closest('.pv-page-body').getBoundingClientRect();
        const heading=document.querySelector('#pvSheet .paper-major').getBoundingClientRect();
        const contentBottom=Math.max(header.querySelector('table').getBoundingClientRect().bottom,logo.getBoundingClientRect().bottom);
        return {logoRatio:logo.getBoundingClientRect().width/logo.getBoundingClientRect().height,natural:logo.naturalWidth/logo.naturalHeight,
          width:b.width,areaWidth:area.width,left:b.left-area.left,right:area.right-b.right,
          headerFont:getComputedStyle(header).fontFamily,bodyFont:getComputedStyle(document.querySelector('#pvSheet .pv-page')).fontFamily,
          headerGap:heading.top-contentBottom,
          watermark:getComputedStyle(document.querySelector('#pvSheet .pv-page'),'::before').content,
          columns:document.getElementById('pTwoCol').checked};
      });
      assert.ok(Math.abs(geometry.logoRatio-geometry.natural)<.01,JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.width-geometry.areaWidth)<.1&&Math.abs(geometry.left-geometry.right)<.1,JSON.stringify(geometry));
      assert.equal(geometry.columns,false);assert.equal(geometry.watermark,'none');
      assert.ok(geometry.headerFont.includes('HuaKangTNR')&&!/芫荽|Kaiti|BiauKai|DFKai/.test(geometry.headerFont));
      assert.ok(geometry.bodyFont.includes('HuaKangTNR'));
      assert.ok(geometry.headerGap>=0&&geometry.headerGap<30,JSON.stringify(geometry));
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
allowed={'ascii':'Times New Roman','hAnsi':'Times New Roman','eastAsia':'DFPYuanMedium-B5','cs':'Times New Roman'}
for name in z.namelist():
 if name.startswith('word/') and name.endswith('.xml'):
  for fonts in E.fromstring(z.read(name)).xpath('//w:rFonts',namespaces=n):
   assert {E.QName(k).localname:v for k,v in fonts.attrib.items()}==allowed,(name,fonts.attrib)
body=r.find('w:body',n)
for i in (1,2,3):
 spacing=body[i].find('w:pPr/w:spacing',n)
 assert spacing.get('{'+n['w']+'}line')=='20' and spacing.get('{'+n['w']+'}lineRule')=='exact'
 assert spacing.get('{'+n['w']+'}after')==('240' if i==1 else '0')
print('Native header/body/PAGE, B4 single column and full-width passage: PASS')`,output]);
      // Multi-page PDF/layout uses the same header once and a footer on every page.
      const rendered=await page.evaluate(async()=>{
        paperDlg.close();DB=Array.from({length:45},(_,i)=>({id:'gold-long-'+i,book:'JB3',unit:'1-1',q:'第 '+i+' 題：'+ '請觀察實驗中的資料，選出正確答案。'.repeat(3)+'\n(A)甲\n(B)乙\n(C)丙\n(D)丁',type:'選',imgs:[]}));
        PICKS=new Set(DB.map(item=>item.id));_pvRebuild();
        const result=await buildPaperOutputPages();const pages=result.pages.map(p=>({html:paperOutputSnapshot(p).outerHTML,questions:p.querySelectorAll('.template-question').length,foot:p.querySelector('.pv-page-foot').textContent}));result.dispose();return pages;
      });
      assert.ok(rendered.length>1);assert.equal(rendered.reduce((n,p)=>n+p.questions,0),45);
      assert.equal(rendered.filter(p=>p.html.includes('golden-template-header')).length,1);
      assert.ok(rendered.every((p,i)=>p.foot===`茲茲  ${i+1}  理化`&&!p.html.includes('abk_watermark')));
      if (engine===chromium) {
        const longDownload=page.waitForEvent('download',{timeout:60000});
        await page.evaluate(()=>downloadWordViaTemplate('golden'));
        await (await longDownload).saveAs('/tmp/golden-web-full.docx');
        execFileSync(process.env.PAPER_TEST_PYTHON||'python3',['-c',
          `from zipfile import ZipFile
from lxml import etree as E
with ZipFile('/tmp/golden-web-full.docx') as z:
 r=E.fromstring(z.read('word/document.xml'))
 assert len(r.xpath('//w:numId[@w:val="100"]',namespaces={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}))==45
print('All 45 questions retained in native Word export: PASS')`]);
        const popupPromise=page.waitForEvent('popup');
        await page.evaluate(()=>{printPaperOutput();});
        const popup=await popupPromise;await popup.bringToFront();await popup.waitForFunction(()=>window.__printReady===true).catch(async error=>{
          console.error('Print window:',(await popup.locator('body').textContent()).slice(0,400));throw error;
        });
        assert.equal(await popup.locator('.template-question').count(),45);
        assert.equal(await popup.locator('.pv-page').count(),rendered.length);
        assert.equal(await popup.locator('[contenteditable],.pvq-ctrl,.noprint').count(),0);
        await popup.pdf({path:'/tmp/golden-web-full.pdf',preferCSSPageSize:true,printBackground:true});
        await popup.close();
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
