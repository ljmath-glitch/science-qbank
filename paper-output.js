/* One full-size paper layout for ABK/prequiz settings and the print/PDF window.
 * Word remains template-backed; this module never changes the approved DOCX.
 */
async function paperOutputWait(root) {
  if (document.fonts) {
    await document.fonts.load('10pt HuaKangTNR', '中文考卷');
    await document.fonts.ready;
  }
  await Promise.all([...root.querySelectorAll('img')].map(image => new Promise((resolve, reject) => {
    const check = () => image.naturalWidth ? resolve() : reject(new Error('圖片載入失敗，請先修正再輸出。'));
    if (image.complete) return check();
    image.addEventListener('load', check, {once: true});
    image.addEventListener('error', () => reject(new Error('圖片載入失敗，請先修正再輸出。')), {once: true});
  })));
}

// 設定頁預覽快取：同一份內容與設定只排版一次，翻頁、切換頁面時直接重用，不重新排版。
let _paperOutputCache = null;
function paperOutputInvalidate() {
  if (_paperOutputCache) {try {_paperOutputCache.mount.remove();} catch (e) {} _paperOutputCache = null;}
}
async function buildPaperOutputPages(opts) {
  opts = opts || {};
  // Save the in-progress selection edit locally before rebuilding. Do not issue
  // a new cloud write just because the user opened export settings.
  if (typeof _pvSyncActiveMarkup === 'function') _pvSyncActiveMarkup();
  if (typeof syncPaperMetadataControls === 'function') syncPaperMetadataControls();
  const state = () => JSON.stringify({
    kind: (document.querySelector('input[name=pPaperKind]:checked') || {}).value,
    mode: paperAnsMode(),
    // 預覽翻頁滑桿不屬於考卷內容，排除它，翻頁才不會讓快取失效。
    controls: [...document.querySelectorAll('#paperDlg input,#paperDlg select')].filter(input => input.id !== 'pdocPageSlider').map(input => [input.id,input.value,input.checked]),
    questions: pickedItems(),
    passages: Object.fromEntries([...new Set(pickedItems().map(item => item.groupId).filter(Boolean))].map(id => [id, PASSAGES[id]])),
  });
  const stateBefore = state();
  // 預設行為維持原樣（每次重排、呼叫端自行 dispose）；只有設定頁預覽傳 {cache:true} 才使用快取。
  if (opts.cache && _paperOutputCache && _paperOutputCache.sig === stateBefore && _paperOutputCache.mount.isConnected) {
    return {mount: _paperOutputCache.mount, pages: _paperOutputCache.pages, cache: _paperOutputCache, dispose() {}};
  }
  if (opts.cache) paperOutputInvalidate();
  const mount = document.createElement('div');
  mount.className = 'paper-output-measure';
  mount.style.cssText = 'position:fixed;left:-12000px;top:0;width:972px;pointer-events:none;';
  document.body.appendChild(mount);
  try {
    _pvRenderPaged(mount, false);
    // 第一次排版時若字型或圖片還在載入，等載入完要再排一次才準；都已就緒就只排一次（省下一半時間）。
    const needSecondPass = !opts.cache || (document.fonts && (document.fonts.status === 'loading' || !document.fonts.check('10pt HuaKangTNR', '中文考卷')))
      || [...mount.querySelectorAll('img')].some(image => !image.complete);
    await paperOutputWait(mount);
    if (state() !== stateBefore) throw new Error('考卷內容或設定已變更，請重新預覽／輸出。');
    if (needSecondPass) {
      // Second pass measures loaded fonts, cached pictures and rendered equations.
      _pvRenderPaged(mount, false);
      await paperOutputWait(mount);
    }
    const pages = [...mount.querySelectorAll('.pv-page')];
    for (const page of pages) {
      const body = page.querySelector('.pv-page-body');
      if (body && (body.getBoundingClientRect().bottom > page.getBoundingClientRect().bottom - 38 || body.scrollWidth > body.clientWidth + 2 || body.scrollHeight > body.clientHeight + 2)) {
        throw new Error('有內容超出紙張範圍，請先縮小圖片或調整這題；目前不會輸出被裁掉的考卷。');
      }
    }
    if (!opts.cache) return {mount, pages, dispose: () => mount.remove()};
    _paperOutputCache = {sig: stateBefore, mount, pages, snaps: []};
    return {mount, pages, cache: _paperOutputCache, dispose() {}};
  } catch (error) {
    mount.remove();
    throw error;
  }
}

// 凍結樣式只需要寫入「與預設不同」或「與父層繼承不同」的屬性。逐元素寫入全部 ~350 個 computed
// 屬性（每頁約 500 個元素）是匯出設定預覽與列印最耗時的步驟之一；差異寫法結果等價、體積與耗時小一個量級。
const _SNAP_INHERITED = new Set(['border-collapse','border-spacing','caption-side','color','color-scheme','cursor','direction','empty-cells','font','font-family','font-feature-settings','font-kerning','font-language-override','font-optical-sizing','font-size','font-size-adjust','font-stretch','font-style','font-synthesis','font-variant','font-variant-alternates','font-variant-caps','font-variant-east-asian','font-variant-ligatures','font-variant-numeric','font-variant-position','font-variation-settings','font-weight','hyphens','image-rendering','letter-spacing','line-break','line-height','list-style','list-style-image','list-style-position','list-style-type','orphans','overflow-wrap','paint-order','pointer-events','print-color-adjust','quotes','tab-size','text-align','text-align-last','text-combine-upright','text-indent','text-justify','text-orientation','text-rendering','text-shadow','text-size-adjust','text-transform','text-underline-position','text-wrap','visibility','white-space','white-space-collapse','widows','word-break','word-spacing','word-wrap','writing-mode','-webkit-font-smoothing','-webkit-text-fill-color','-webkit-text-stroke-color','-webkit-text-stroke-width','-webkit-print-color-adjust','-webkit-text-size-adjust','-webkit-locale','fill','stroke','stroke-width']);
let _snapFrame = null;
const _snapDefaultCache = new Map();
function _snapDefaults(element) {
  const key = (element.namespaceURI || '') + '|' + element.localName;
  if (_snapDefaultCache.has(key)) return _snapDefaultCache.get(key);
  if (!_snapFrame || !_snapFrame.isConnected) {
    _snapFrame = document.createElement('iframe');
    _snapFrame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;visibility:hidden';
    document.body.appendChild(_snapFrame);
    const doc = _snapFrame.contentDocument;
    doc.open(); doc.write('<!doctype html><html><head></head><body></body></html>'); doc.close();
    _snapDefaultCache.clear();
  }
  const doc = _snapFrame.contentDocument;
  const probe = element.namespaceURI && element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    ? doc.createElementNS(element.namespaceURI, element.localName) : doc.createElement(element.localName);
  doc.body.appendChild(probe);
  const style = _snapFrame.contentWindow.getComputedStyle(probe), map = new Map();
  for (const name of style) map.set(name, style.getPropertyValue(name));
  probe.remove();
  _snapDefaultCache.set(key, map);
  return map;
}
function _snapDiffCss(original, parentComputed) {
  const computed = getComputedStyle(original), base = _snapDefaults(original), out = [];
  for (const name of computed) {
    const value = computed.getPropertyValue(name);
    if (_SNAP_INHERITED.has(name)) {
      if (!parentComputed || parentComputed.getPropertyValue(name) !== value) out.push(name + ':' + value);
    } else if (base.get(name) !== value) out.push(name + ':' + value);
  }
  return out.join(';');
}
function paperOutputSnapshot(source) {
  const clone = source.cloneNode(true);
  function copy(original, target, parentComputed) {
    const computed = getComputedStyle(original);
    target.style.cssText = _snapDiffCss(original, parentComputed);
    [...target.attributes].forEach(attribute => {
      if (/^on/i.test(attribute.name) || ['id', 'contenteditable', 'draggable', 'data-editing'].includes(attribute.name)) target.removeAttribute(attribute.name);
    });
    if (original.matches('.pvq-text,.pvh')) {
      target.style.boxShadow = 'none';
      target.style.outline = 'none';
      target.style.background = 'transparent';
    }
    [...original.children].forEach((child, index) => copy(child, target.children[index], computed));
    // The ABK watermark is a CSS pseudo-element; retain it in the frozen paper.
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(original, pseudo);
      if (!style.content || ['none', 'normal'].includes(style.content)) continue;
      const element = document.createElement('span');
      element.dataset.paperPseudo = pseudo;
      element.style.cssText = [...style].map(key => key + ':' + style.getPropertyValue(key)).join(';');
      element.textContent = style.content.replace(/^["']|["']$/g, '');
      if (pseudo === '::before') target.prepend(element); else target.append(element);
    }
  }
  copy(source, clone, null);
  clone.querySelectorAll('.noprint,.pvq-ctrl,.pvimg-corner,.pvimg-controls').forEach(node => node.remove());
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.transform = 'none';
  clone.style.breakInside = 'avoid';
  clone.style.breakAfter = 'page';
  clone.style.pageBreakAfter = 'always';
  return clone;
}

function paperPreviewClone(page) {
  const clone = page.cloneNode(true);
  clone.querySelectorAll('.noprint,.pvq-ctrl,.pvimg-corner,.pvimg-controls,.pvimg-tools').forEach(node => node.remove());
  clone.querySelectorAll('*').forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || ['id', 'contenteditable', 'draggable', 'data-editing'].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
    if (node.matches('.pvq-text,.pvh')) {node.style.boxShadow = 'none'; node.style.outline = 'none'; node.style.background = 'transparent';}
  });
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.transform = 'none';
  return clone;
}

let paperOutputPreviewRevision = 0;
async function refreshAbkOutputPreview() {
  const revision = ++paperOutputPreviewRevision;
  const target = document.getElementById('paperSettingsPreview');
  let rendered;
  try {
    const mode = paperAnsMode();
    rendered = mode === 'full' ? {pages:[],dispose(){}} : await buildPaperOutputPages({cache: true});
    if (revision !== paperOutputPreviewRevision || !['abk','pre','golden'].includes((document.querySelector('input[name=pPaperKind]:checked') || {}).value)) return;
    const questionPages = mode === 'full' ? [] : rendered.pages;
    const solutions = (mode === 'full' || mode === 'both_full')
      ? paperQuestionSections(pickedItems()).ordered.map((item,index) => solutionExportQuestion(item,index+1)) : [];
    const solutionPages = [];
    for(let index=0;index<solutions.length;index+=8) solutionPages.push(solutions.slice(index,index+8));
    _paperSettingsPageCount = Math.max(1, questionPages.length + solutionPages.length);
    _paperSettingsPage = Math.min(_paperSettingsPage, _paperSettingsPageCount - 1);
    if (_paperSettingsPage < questionPages.length) {
      // 設定頁預覽與排版區在同一個文件、套用同一份樣式，直接複製頁面（幾毫秒）。
      // 「凍結所有 computed style」的快照（paperOutputSnapshot）只留給列印視窗：它每頁要花數百毫秒到近一秒。
      // 已用逐元素比對驗證：複製頁面與快照在版面尺寸與樣式上完全一致。
      target.replaceChildren(paperPreviewClone(questionPages[_paperSettingsPage]));
      document.querySelector('.pdoc-preview-head').innerHTML = '文件預覽 <small>B4 題目卷・與 PDF 共用整頁排版</small>';
    } else {
      target.innerHTML = _solPreviewSheet(document.getElementById('pTitle').value, solutionPages[_paperSettingsPage-questionPages.length] || []);
      renderMath(target);
      document.querySelector('.pdoc-preview-head').innerHTML = '文件預覽 <small>A4 解析卷・版型示意（非 Word 實際分頁）</small>';
    }
    const slider = document.getElementById('pdocPageSlider');
    slider.max = _paperSettingsPageCount;
    slider.value = _paperSettingsPage + 1;
    document.getElementById('pdocPrev').disabled = _paperSettingsPage === 0;
    document.getElementById('pdocNext').disabled = _paperSettingsPage === _paperSettingsPageCount - 1;
    document.getElementById('pdocPageLabel').textContent = `第 ${_paperSettingsPage + 1} / ${_paperSettingsPageCount} 頁`;
    requestAnimationFrame(scalePaperSettingsPreview);
  } catch (error) {
    if (revision === paperOutputPreviewRevision) target.textContent = error.message;
  } finally {
    if (rendered) rendered.dispose();
  }
}

async function printPaperOutput() {
  if (!PICKS.size) {alert('尚未選題'); return;}
  const kind = (document.querySelector('input[name=pPaperKind]:checked') || {}).value || 'pre';
  if (!['abk','pre','golden'].includes(kind) || paperAnsMode() === 'full') {
    alert('這個整頁 PDF 流程支援 ABK／課前考／黃金模擬考題目卷。請勾選「題目卷」；解析卷仍可下載 Word。');
    return;
  }
  if (kind === 'abk') {
    try {readPaperTemplateMetadata(true);}
    catch(error) {alert(error.message);return;}
  }
  // Open synchronously inside the user click, before fonts/images are awaited.
  const output = window.open('', '_blank');
  if (!output) {alert('請允許此網站開啟列印視窗。'); return;}
  output.document.body.textContent = '正在準備考卷，載入字型與圖片…';
  let rendered;
  try {
    rendered = await buildPaperOutputPages();
    if (output.closed) return;
    const doc = output.document;
    const base = doc.createElement('base');base.href = document.baseURI;doc.head.appendChild(base);
    doc.title = (document.getElementById('pTitle').value || (kind === 'pre' ? '課前考' : kind === 'golden' ? '段考黃金模擬考' : 'ABK 考卷')) + '（題目卷）';
    document.querySelectorAll('link[rel=stylesheet]').forEach(link => doc.head.appendChild(link.cloneNode(true)));
    const style = doc.createElement('style');
    const paperFaces = document.fonts ? [...document.fonts].filter(face => face.family.replace(/['"]/g, '') === 'HuaKangTNR') : [];
    const sharePaperFaces = doc.fonts && paperFaces.length && paperFaces.every(face => face.status === 'loaded');
    const fonts = [...document.querySelectorAll('style')].flatMap(node => node.textContent.match(/@font-face\s*\{[^}]*\}/g) || [])
      .filter(rule => !sharePaperFaces || !/font-family\s*:\s*['"]?HuaKangTNR/.test(rule)).join('\n');
    style.textContent = fonts + '\n@page{size:257mm 364mm;margin:0}body{margin:0;background:white} .pv-page{break-after:page;page-break-after:always;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pv-page:last-child{break-after:auto;page-break-after:auto}@media screen{body{background:#e7e2d9}.pv-page{margin:20px auto!important}}';
    doc.head.appendChild(style);
    // The editor has already loaded this exact split CJK/Latin family. Share
    // those ready FontFace objects with the blank print window before layout,
    // rather than requesting the same CJK file again from an about:blank page.
    // Keep the CSS declarations as a fallback for engines without FontFaceSet.
    if (sharePaperFaces) {
      for (const face of paperFaces) doc.fonts.add(face);
    }
    doc.body.replaceChildren(...rendered.pages.map(page => doc.importNode(paperOutputSnapshot(page), true)));
    doc.body.lastElementChild.style.breakAfter = 'auto';
    doc.body.lastElementChild.style.pageBreakAfter = 'auto';
    // Trigger the webfont used on this page in the new document before printing.
    if (doc.fonts) {await doc.fonts.load('10pt HuaKangTNR', '中文考卷');await doc.fonts.ready;}
    await Promise.all([...doc.images].map(image => image.decode()));
    if (!output.closed) {output.focus();output.print();}
  } catch (error) {
    if (!output.closed) output.document.body.textContent = '無法輸出：' + error.message;
    alert('PDF 準備失敗：' + error.message);
  } finally {
    if (rendered) rendered.dispose();
  }
}

// 關閉匯出設定視窗時釋放預覽快取（避免佔用記憶體，也避免下次開啟用到舊內容）。
(function() {
  const dlg = document.getElementById('paperDlg');
  if (dlg) dlg.addEventListener('close', paperOutputInvalidate);
})();

// Keep mock papers on their established export path.
document.querySelectorAll('#paperDlg button[onclick*="window.print"]').forEach(button => {
  const original = button.onclick;
  button.onclick = function(event) {
    const kind = (document.querySelector('input[name=pPaperKind]:checked') || {}).value;
    if (['abk','pre','golden'].includes(kind)) return printPaperOutput();
    return original && original.call(this, event);
  };
});
