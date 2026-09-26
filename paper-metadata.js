/* One source of truth for the editor, export settings and template headers. */
const PAPER_BOOK_NAMES = ['第一冊','第二冊','第三冊','第四冊','第五冊','第六冊'];
const PAPER_METADATA_PAIRS = [
  ['pTitle','pvTitle'], ['pAbkVariant','pvAbkVariant'],
  ['pBookCode','pvBookCode'], ['pChapterRange','pvChapterRange'],
];
function paperTemplateImage(image) {
  return image && image.src ? `<img class="qimg" src="${esc(image.src)}" alt="題目圖片">` : '';
}
function scalePaperEditorPages() {
  const host = document.getElementById('pvSheet');
  const scale = Math.min(1, Math.max(0.15,(host.clientWidth - 32) / 972));
  for (const page of host.querySelectorAll('.template-paper')) {
    let stage = page.parentElement;
    if (!stage.classList.contains('pv-page-stage')) {
      stage = document.createElement('div');stage.className = 'pv-page-stage';
      page.before(stage);stage.appendChild(page);
    }
    stage.style.width = 972 * scale + 'px';
    stage.style.height = 1375 * scale + 'px';
    page.style.transform = `scale(${scale})`;
  }
}
window.addEventListener('resize', scalePaperEditorPages);
let paperEditorRevision = 0;
async function refreshPaperEditorWhenReady() {
  const revision = ++paperEditorRevision;
  const host = document.getElementById('pvSheet');
  try {
    await paperOutputWait(host);
    if (revision === paperEditorRevision && document.getElementById('paperView').classList.contains('show') && !host.querySelector('[data-editing]')) {
      const scroll = host.scrollTop;_pvRenderPaged();host.scrollTop = scroll;
    }
  } catch (error) {console.warn('考卷預覽載入未完成：', error.message);}
}
function paperBookFromText(text) {
  const explicit = String(text || '').match(/\bJB([1-6])\b/i);
  if (explicit) return 'JB' + explicit[1];
  const chinese = String(text || '').match(/第([一二三四五六1-6])冊/);
  if (!chinese) return '';
  const number = '一二三四五六'.indexOf(chinese[1]) + 1 || Number(chinese[1]);
  return 'JB' + number;
}
function paperChapterCode(text) {
  let value = String(text || '').trim().normalize('NFKC');
  value = value.replace(/第([一二三四五六七八九十\d]+)章/g, (_, n) => {
    const number = '一二三四五六七八九十'.indexOf(n) + 1;
    return 'CH' + (number || n);
  }).replace(/[、，,；;]/g, '+').replace(/\s/g, '').replace(/Ch\.?/gi, 'CH');
  if (!value) return '';
  const parts = value.split('+');
  if (parts.some(part => !/^(?:CH)?\d+(?:[-.]\d+)*$/.test(part))) return '';
  return [...new Set(parts.map(part => 'CH' + part.replace(/^CH/, '').replace(/\./g, '-')))].join('+');
}
function readPaperTemplateMetadata(validate = false, variantOverride) {
  const value = id => (document.getElementById(id)?.value || '').trim();
  const title = value('pTitle');
  const bookCode = value('pBookCode');
  const variant = variantOverride || value('pAbkVariant');
  const chapterRange = paperChapterCode(value('pChapterRange'));
  if (validate) {
    if (!title) throw new Error('請填寫考卷標題。');
    if (!/^JB[1-6]$/.test(bookCode)) throw new Error('請選擇冊次。');
    if (!/^[ABK]$/.test(variant)) throw new Error('請選擇 A、B 或 K 卷。');
    if (!chapterRange) throw new Error('請填寫章節範圍，例如 CH1+CH2 或 1-1+1-2。');
  }
  return {title, bookCode, book: bookCode.slice(2), variant, chapterRange,
    code: `SCI-${bookCode}-${chapterRange || '（請填章節）'}-${variant}`};
}
function syncPaperMetadataControls() {
  const abk = document.querySelector('input[name=pPaperKind]:checked')?.value === 'abk';
  for (const id of ['paperAbkFields', 'pvAbkFields']) document.getElementById(id).hidden = !abk;
  for (const [source, mirror] of PAPER_METADATA_PAIRS) {
    const original = document.getElementById(source), target = document.getElementById(mirror);
    if (target.value !== original.value) target.value = original.value;
  }
  const metadata = readPaperTemplateMetadata();
  document.getElementById('pPaperCode').value = metadata.code;
  document.getElementById('pvPaperCode').textContent = metadata.code;
  const range = document.getElementById('pChapterRange');
  range.setCustomValidity(range.value.trim() && !metadata.chapterRange ? '章節請輸入 CH1+CH2 或 1-1+1-2。' : '');
}
function initPaperMetadataDefaults() {
  const items = pickedItems();
  const book = paperBookFromText(document.getElementById('pTitle').value + ' ' + document.getElementById('pScope').value)
    || paperBookFromText(document.getElementById('fBook')?.value)
    || items.map(item => paperBookFromText(item.book)).find(Boolean);
  if (book) document.getElementById('pBookCode').value = book;
  const ranges = items.map(item => paperChapterCode(item.unit)).filter(Boolean);
  document.getElementById('pChapterRange').value = [...new Set(ranges.flatMap(range => range.split('+')))].join('+');
  syncPaperMetadataControls();
}
let paperMetadataRebuildTimer;
function paperMetadataChanged(sourceId, value) {
  if (typeof _pvSyncActiveMarkup === 'function') _pvSyncActiveMarkup();
  document.getElementById(sourceId).value = value;
  if (sourceId === 'pTitle') {
    const book = paperBookFromText(value);
    if (book) document.getElementById('pBookCode').value = book;
  }
  if (sourceId === 'pBookCode') {
    const title = document.getElementById('pTitle');
    title.value = title.value.replace(/第[一二三四五六1-6]冊/g, PAPER_BOOK_NAMES[Number(value.slice(2)) - 1]);
  }
  syncPaperMetadataControls();
  clearTimeout(paperMetadataRebuildTimer);
  paperMetadataRebuildTimer = setTimeout(() => {
    _paperSettingsPage = 0;
    if (document.getElementById('paperView').classList.contains('show')) {
      const scroll = document.getElementById('pvSheet').scrollTop;
      _pvRebuild();document.getElementById('pvSheet').scrollTop = scroll;
    }
    _rebuildLastPaperHTML();
    paperSettingsPreviewLater();
  }, 100);
}
for (const [source, mirror] of PAPER_METADATA_PAIRS) {
  for (const id of [source, mirror]) {
    const control = document.getElementById(id);
    control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => paperMetadataChanged(source, control.value));
  }
}
// Change text only: native header geometry, fonts, watermark and fallback shapes stay intact.
function patchAbkTemplateCode(zip, code) {
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for (const path of ['word/header1.xml', 'word/header2.xml']) {
    const entry = zip.file(path);
    if (!entry) throw new Error('ABK 範本缺少頁首：' + path);
    const xml = new DOMParser().parseFromString(entry.asText(), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('ABK 範本頁首 XML 無法讀取。');
    let changed = 0;
    for (const paragraph of [...xml.getElementsByTagNameNS(namespace, 'p')]) {
      // Exclude outer paragraphs that contain nested text boxes.
      const texts = [...paragraph.getElementsByTagNameNS(namespace, 't')].filter(text => {
        let parent = text.parentElement;
        while (parent && !(parent.namespaceURI === namespace && parent.localName === 'p')) parent = parent.parentElement;
        return parent === paragraph;
      });
      if (!texts.map(text => text.textContent).join('').trim().startsWith('SCI-JB')) continue;
      texts[0].textContent = code;
      texts.slice(1).forEach(text => {text.textContent = '';});
      changed++;
    }
    if (!changed) throw new Error('找不到 ABK 範本的考卷編號。');
    zip.file(path, new XMLSerializer().serializeToString(xml));
  }
}
const paperMetadataStyle = document.createElement('style');
paperMetadataStyle.textContent = `#pvPaperMetadata{display:flex}#paperAbkFields[hidden],#pvAbkFields[hidden]{display:none!important}
#pvPaperMetadata label{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#555}
#pvPaperMetadata input,#pvPaperMetadata select{font:inherit;padding:7px;border:1px solid #ddd;border-radius:6px;background:white}
#pvTitle{width:240px}#pvChapterRange{width:155px}#pvAbkFields:not([hidden]){display:flex;gap:12px;align-items:center;flex-wrap:wrap}
#pvPaperCode{font:12px monospace;color:#777}#pPaperCode{font-size:12px}
#paperView.show{display:flex;flex-direction:column;overflow:hidden}#paperView .pv-bar,#paperView .pv-fmt-bar{position:relative!important;top:auto!important;flex-shrink:0;background:#fffdf9;z-index:30}
#paperView.show>#pvSheet{overflow:auto;flex:1;min-height:0;margin-bottom:0;width:100%}
body:has(#paperView.show){overflow:hidden}body:has(#paperView.show) #floatbar{display:none!important}`;
document.head.appendChild(paperMetadataStyle);
syncPaperMetadataControls();
