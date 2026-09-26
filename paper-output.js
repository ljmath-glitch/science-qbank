/* One full-size paper layout for ABK export settings and the print/PDF window.
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

async function buildPaperOutputPages() {
  // Save the in-progress selection edit locally before rebuilding. Do not issue
  // a new cloud write just because the user opened export settings.
  if (typeof _pvSyncActiveMarkup === 'function') _pvSyncActiveMarkup();
  const state = () => JSON.stringify({
    kind: (document.querySelector('input[name=pPaperKind]:checked') || {}).value,
    mode: paperAnsMode(),
    controls: [...document.querySelectorAll('#paperDlg input,#paperDlg select')].map(input => [input.id,input.value,input.checked]),
    questions: pickedItems(),
    passages: Object.fromEntries([...new Set(pickedItems().map(item => item.groupId).filter(Boolean))].map(id => [id, PASSAGES[id]])),
  });
  const stateBefore = state();
  const mount = document.createElement('div');
  mount.className = 'paper-output-measure';
  mount.style.cssText = 'position:fixed;left:-12000px;top:0;width:972px;pointer-events:none;';
  document.body.appendChild(mount);
  try {
    _pvRenderPaged(mount, false);
    await paperOutputWait(mount);
    if (state() !== stateBefore) throw new Error('考卷內容或設定已變更，請重新預覽／輸出。');
    // Second pass measures loaded fonts, cached pictures and rendered equations.
    _pvRenderPaged(mount, false);
    await paperOutputWait(mount);
    const pages = [...mount.querySelectorAll('.pv-page')];
    for (const page of pages) {
      const body = page.querySelector('.pv-page-body');
      if (body && (body.getBoundingClientRect().bottom > page.getBoundingClientRect().bottom - 38 || body.scrollWidth > body.clientWidth + 2 || body.scrollHeight > body.clientHeight + 2)) {
        throw new Error('有內容超出紙張範圍，請先縮小圖片或調整這題；目前不會輸出被裁掉的考卷。');
      }
    }
    return {mount, pages, dispose: () => mount.remove()};
  } catch (error) {
    mount.remove();
    throw error;
  }
}

function paperOutputSnapshot(source) {
  const clone = source.cloneNode(true);
  function copy(original, target) {
    const computed = getComputedStyle(original);
    target.style.cssText = [...computed].map(key => key + ':' + computed.getPropertyValue(key)).join(';');
    [...target.attributes].forEach(attribute => {
      if (/^on/i.test(attribute.name) || ['id', 'contenteditable', 'draggable', 'data-editing'].includes(attribute.name)) target.removeAttribute(attribute.name);
    });
    if (original.matches('.pvq-text,.pvh')) {
      target.style.boxShadow = 'none';
      target.style.outline = 'none';
      target.style.background = 'transparent';
    }
    [...original.children].forEach((child, index) => copy(child, target.children[index]));
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
  copy(source, clone);
  clone.querySelectorAll('.noprint,.pvq-ctrl,.pvimg-corner,.pvimg-controls').forEach(node => node.remove());
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.transform = 'none';
  clone.style.breakInside = 'avoid';
  clone.style.breakAfter = 'page';
  clone.style.pageBreakAfter = 'always';
  return clone;
}

let paperOutputPreviewRevision = 0;
async function refreshAbkOutputPreview() {
  const revision = ++paperOutputPreviewRevision;
  const target = document.getElementById('paperSettingsPreview');
  let rendered;
  try {
    rendered = await buildPaperOutputPages();
    if (revision !== paperOutputPreviewRevision || !['abk','pre'].includes((document.querySelector('input[name=pPaperKind]:checked') || {}).value)) return;
    const mode = paperAnsMode();
    const questionPages = mode === 'full' ? [] : rendered.pages;
    const solutions = (mode === 'full' || mode === 'both_full')
      ? paperQuestionSections(pickedItems()).ordered.map((item,index) => solutionExportQuestion(item,index+1)) : [];
    const solutionPages = [];
    for(let index=0;index<solutions.length;index+=8) solutionPages.push(solutions.slice(index,index+8));
    _paperSettingsPageCount = Math.max(1, questionPages.length + solutionPages.length);
    _paperSettingsPage = Math.min(_paperSettingsPage, _paperSettingsPageCount - 1);
    if (_paperSettingsPage < questionPages.length) {
      target.replaceChildren(paperOutputSnapshot(questionPages[_paperSettingsPage]));
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
  if (!['abk','pre'].includes(kind) || paperAnsMode() === 'full') {
    alert('這個整頁 PDF 流程支援 ABK／課前考題目卷。請勾選「題目卷」；解析卷仍可下載 Word。');
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
    doc.title = (document.getElementById('pTitle').value || 'ABK 考卷') + '（題目卷）';
    document.querySelectorAll('link[rel=stylesheet]').forEach(link => doc.head.appendChild(link.cloneNode(true)));
    const style = doc.createElement('style');
    const fonts = [...document.querySelectorAll('style')].map(node => (node.textContent.match(/@font-face\s*\{[^}]*\}/g) || []).join('\n')).join('\n');
    style.textContent = fonts + '\n@page{size:257mm 364mm;margin:0}body{margin:0;background:white} .pv-page{break-after:page;page-break-after:always;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pv-page:last-child{break-after:auto;page-break-after:auto}@media screen{body{background:#e7e2d9}.pv-page{margin:20px auto!important}}';
    doc.head.appendChild(style);
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

// Keep other paper types on their established export path for this first phase.
document.querySelectorAll('#paperDlg button[onclick*="window.print"]').forEach(button => {
  const original = button.onclick;
  button.onclick = function(event) {
    const kind = (document.querySelector('input[name=pPaperKind]:checked') || {}).value;
    if (kind === 'abk' || kind === 'pre') return printPaperOutput();
    return original && original.call(this, event);
  };
});
