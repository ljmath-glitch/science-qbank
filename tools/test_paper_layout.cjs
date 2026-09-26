const assert=require('node:assert/strict');
const {webkit,chromium}=require('playwright');
(async()=>{
  for(const engine of [webkit,chromium]){
    const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.PAPER_TEST_CHROME?{executablePath:process.env.PAPER_TEST_CHROME}:{})});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:1000}});
      await page.goto('http://127.0.0.1:8765/index.html?mode=test',{waitUntil:'load'});
      await page.evaluate(()=>{
        DB=Array.from({length:36},(_,i)=>({id:'layout-'+i,book:'JB3',unit:'1-1',type:'選',q:'量測體積和質量，判斷物質性質。\n(A) 反應前後原子種類不變\n(B) 溫度為30℃\n(C) 質量守恆\n(D) 以上皆是',imgs:[]}));
        const canvas=document.createElement('canvas');canvas.width=200;canvas.height=800;canvas.getContext('2d').fillRect(0,0,200,800);DB[0].imgs=[{src:canvas.toDataURL(),width:100}];
        PICKS=new Set(DB.map(item=>item.id));pAns.value='none';pTitle.value='國八理化 第三冊';pChapterRange.value='CH1+CH2';pvSetPaperKind('abk');showPaperPreview();
      });
      await page.waitForFunction(()=>document.fonts.status==='loaded');
      await page.evaluate(()=>refreshPaperEditorWhenReady());
      const measure=()=>{
        const first=document.querySelector('#pvSheet .pv-page');
        const question=first.querySelector('.template-question');
        const marker=question.querySelector('.paper-question-marker');
        const text=question.querySelector('.pvq-text');
        const columns=getComputedStyle(first.querySelector('.paper-2col'));
        const image=first.querySelector('.qimg');
        return {pages:document.querySelectorAll('#pvSheet .pv-page').length,width:first.offsetWidth,height:first.offsetHeight,
          gap:parseFloat(columns.columnGap),indent:getComputedStyle(question).paddingLeft,after:getComputedStyle(question).marginBottom,
          overlap:marker.getBoundingClientRect().right>text.getBoundingClientRect().left,
          ratio:image.clientWidth/image.clientHeight,imageHeight:image.clientHeight,
          marker:marker.textContent,choiceGap:/\([A-D]\)\s/.test(text.textContent),
          root:getComputedStyle(document.getElementById('paperView')).overflow,scroll:getComputedStyle(document.getElementById('pvSheet')).overflow,
          watermark:getComputedStyle(first,'::before').backgroundImage};
      };
      const wide=await page.evaluate(measure);
      assert.ok(wide.pages>=2);assert.equal(wide.width,972);assert.equal(wide.height,1375);
      assert.ok(Math.abs(wide.gap-47.27)<.01);assert.ok(Math.abs(parseFloat(wide.indent)-37.8)<.01);assert.equal(wide.after,'8px');
      assert.equal(wide.overlap,false,'Answer blank must not overlap question text');
      assert.ok(Math.abs(wide.ratio-.25)<.01&&wide.imageHeight<=135);
      assert.equal(wide.choiceGap,false);assert.equal(wide.root,'hidden');assert.equal(wide.scroll,'auto');assert.ok(wide.watermark.includes('abk_watermark.png'));
      await page.setViewportSize({width:720,height:900});
      await page.waitForFunction(()=>document.querySelector('.pv-page-stage').offsetWidth<=720);
      const narrow=await page.evaluate(measure);assert.equal(narrow.pages,wide.pages);assert.equal(narrow.width,972);assert.equal(narrow.height,1375);
      const scaled=await page.evaluate(()=>{
        const stage=document.querySelector('.pv-page-stage');const page=stage.firstElementChild;
        return {width:stage.offsetWidth,ratio:stage.offsetHeight/stage.offsetWidth,scaled:getComputedStyle(page).transform!=='none'};
      });
      assert.ok(scaled.width<=720&&Math.abs(scaled.ratio-1375/972)<.01&&scaled.scaled,JSON.stringify(scaled));
      await page.evaluate(()=>{for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();});
      await page.screenshot({path:'/tmp/'+engine.name()+'-abk-layout.png'});
      await page.evaluate(()=>pvSetPaperKind('pre'));
      const pre=await page.evaluate(()=>({column:getComputedStyle(document.querySelector('#pvSheet .pv-page-body')).columnCount,header:!!document.querySelector('.pre-header-band'),abkVisible:!document.getElementById('pvAbkFields').hidden}));
      assert.equal(pre.column,'auto');assert.ok(pre.header);assert.equal(pre.abkVisible,false);
      console.log(engine.name()+': B4 scaling without reflow, ruler, inline image ratios, no overlap, single scroll and prequiz header: PASS');
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
