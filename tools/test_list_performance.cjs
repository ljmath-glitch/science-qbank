const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8767/index.html?mode=test', { waitUntil: 'load' });
    const result = await page.evaluate(() => {
      HIDE_SOL = false;
      _renderLimit = RENDER_CAP;
      PASSAGES = { group1: { q: '題組 $x^2$', imgs: [{ src: 'data:image/png;base64,AAAA', width: 50 }] } };
      const items = Array.from({ length: 125 }, (_, i) => ({
        id: `performance-${i}`, groupId: i === 0 || i === 1 || i === 60 ? 'group1' : '',
        q: `題目 ${i} $x^2$\n(A)甲\n(B)乙\n(C)丙\n(D)丁`,
        sol: '詳解內容 '.repeat(40),
        imgs: [{ src: 'data:image/png;base64,AAAA', width: 50 }],
      }));
      const list = document.getElementById('list');
      _lastShown = items;
      renderPage(list, items, 0);
      const first = list.querySelector('.card');
      const initial = list.querySelectorAll('.card').length;
      const initialPassages = list.querySelectorAll('.list-passage').length;
      const lazy = [...list.querySelectorAll('.qimg')].every(img => img.loading === 'lazy' && img.decoding === 'async');
      const solutionVisible = first.textContent.includes('詳解內容');
      showMoreQuestions();
      return {
        initial, initialPassages, lazy, solutionVisible,
        appended: list.querySelectorAll('.card').length,
        sameFirst: first === list.querySelector('.card'),
        passagesAfterAppend: list.querySelectorAll('.list-passage').length,
        moreLabel: list.querySelector('.list-more')?.textContent,
      };
    });
    assert.equal(result.initial, 60);
    assert.equal(result.initialPassages, 1);
    assert.equal(result.lazy, true);
    assert.equal(result.solutionVisible, true);
    assert.equal(result.appended, 120);
    assert.equal(result.sameFirst, true);
    assert.equal(result.passagesAfterAppend, 1);
    assert.match(result.moreLabel, /120 \/ 125/);
    console.log('question list lazy images, passage dedupe, visible solutions, incremental append: PASS');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
