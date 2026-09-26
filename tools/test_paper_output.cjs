// Run with the bundled Node runtime and NODE_PATH set to its modules directory.
const assert = require('node:assert/strict');
const {webkit, chromium} = require('playwright');

(async () => {
  for (const engine of [webkit, chromium]) {
    const launch = {headless: true};
    if(engine === chromium && process.env.PAPER_TEST_CHROME) launch.executablePath = process.env.PAPER_TEST_CHROME;
    const browser = await engine.launch(launch);
    try {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      await page.goto('http://127.0.0.1:8765/index.html?mode=test', {waitUntil: 'load'});
      const result = await page.evaluate(async () => {
        document.querySelector('input[name=pPaperKind][value=abk]').checked = true;
        document.getElementById('pTwoCol').checked = true;
        document.getElementById('pAns').value = 'none';
        document.getElementById('pTitle').value = 'ABK 預覽與 PDF 測試';
        document.getElementById('pExamName').value = 'ABK 預覽與 PDF 測試';
        document.getElementById('pBookCode').value = 'JB3';
        document.getElementById('pChapterRange').value = 'CH1+CH2';
        DB = Array.from({length: 26}, (_, index) => ({id: 'preview-'+index, q: '第 '+(index+1)+' 題測試：下列關於測量的敘述何者正確？\n(A)甲的質量為 10 g\n(B)乙的體積為 20 cm³\n(C)溫度為 25℃\n(D)以上皆是', imgs: [], type: '選'}));
        for (const [index, width, height] of [[0, 200, 400], [1, 400, 100]]) {
          const canvas = document.createElement('canvas');canvas.width=width;canvas.height=height;
          canvas.getContext('2d').fillRect(0,0,width,height);
          DB[index].imgs = [{src: canvas.toDataURL(), width: 40, align: 'left'}];
        }
        DB[2].q += '\n公式測試：$\\frac{20}{10}=2$。';
        PICKS = new Set(DB.map(item => item.id));
        const rendered = await buildPaperOutputPages();
        const total = rendered.pages.length;
        const frozen = paperOutputSnapshot(rendered.pages[0]);
        const firstHtml = frozen.outerHTML;
        const geometry = rendered.pages.map(p => [p.offsetWidth, p.offsetHeight]);
        const questionCount = rendered.mount.querySelectorAll('.q').length;
        rendered.dispose();
        await refreshAbkOutputPreview();
        const settings = document.getElementById('paperSettingsPreview');
        const samePreview = settings.firstElementChild.outerHTML === firstHtml;
        const watermark = !!settings.querySelector('[data-paper-pseudo="::before"]');
        const controls = settings.querySelectorAll('[contenteditable],.pvq-ctrl,.pvimg-corner,[onclick]').length;
        const outputButton = [...document.querySelectorAll('#paperDlg button')].find(b => b.textContent.includes('儲存 PDF'));
        const bound = outputButton.onclick.toString().includes('printPaperOutput');
        const ratios = [...settings.querySelectorAll('.qimg')].map(img => parseFloat(img.style.width)/parseFloat(img.style.height));
        const equations = settings.querySelectorAll('.katex').length;
        return {total, geometry, questionCount, samePreview, watermark, controls, bound, ratios, equations, title: settings.textContent};
      });
      assert.ok(result.total >= 1, 'All selected questions must paginate');
      assert.equal(result.questionCount, 26);
      assert.ok(result.geometry.every(([w,h]) => w === 972 && h === 1375));
      assert.ok(result.samePreview, 'Settings preview must use exactly the same frozen full page');
      assert.ok(result.watermark, 'Pseudo-element watermark must survive snapshotting');
      assert.equal(result.controls, 0, 'PDF must not contain editing controls');
      assert.ok(result.bound, 'PDF button must use the new paper-only flow');
      assert.ok(result.equations > 0, 'Equation geometry must be rendered before measuring');
      assert.ok(Math.abs(result.ratios[0]-.5)<.01 && Math.abs(result.ratios[1]-4)<.01, 'Frozen figures must keep natural proportions: '+JSON.stringify(result.ratios));
      await page.setViewportSize({width: 800, height: 900});
      const narrow = await page.evaluate(async () => {
        const output = await buildPaperOutputPages();
        const widths = output.pages.map(p => [p.offsetWidth,p.offsetHeight]); output.dispose(); return widths;
      });
      assert.ok(narrow.every(([w,h]) => w === 972 && h === 1375), 'Narrow viewport must not reflow PDF paper');
      const overflowBlocked = await page.evaluate(async () => {
        const previous = DB[0].q;
        DB[0].q = Array(1000).fill('超長題目不能被裁掉。').join('\n');
        try {const output = await buildPaperOutputPages();output.dispose();return 'No error';}
        catch(error) {return error.message;}
        finally {DB[0].q = previous;}
      });
      assert.ok(overflowBlocked.includes('超出紙張'), 'Oversized questions must not silently print clipped: '+overflowBlocked);
      if (engine === chromium && process.argv.includes('--pdf')) {
        // Prepare the real print window, overriding only the native print dialog.
        const popupPromise = page.waitForEvent('popup');
        await page.evaluate(() => {
          const open = window.open.bind(window);
          window.open = (...args) => {const output = open(...args);output.print = () => {output.__printReady = true;};return output;};
          printPaperOutput();
        });
        const popup = await popupPromise;
        await popup.waitForFunction(() => window.__printReady === true);
        await popup.pdf({path: '/tmp/abk-web-preview-test.pdf', preferCSSPageSize: true, printBackground: true});
      }
      console.log(engine.name() + ': shared pages, watermark, no tools, PDF click, narrow viewport: PASS');
    } finally {await browser.close();}
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
