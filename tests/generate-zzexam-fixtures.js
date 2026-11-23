/* Generates inspectable DOCX fixtures from ZZExam.buildParts without browser JSZip. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const L = require('../paper-layouts.js');
const ctx = { window: { PaperLayouts: L } }; ctx.window.window = ctx.window;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'zz-exam-docx.js'), 'utf8'), ctx);
const Z = ctx.window.ZZExam;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function spec(kind) {
  return { kind, style: 'formal', field: '自然', title: `假資料 ${kind}`, teacher: false,
    meta: { subject:'自然', book:'第一冊', label:'第一章', variant:'A', chapter:'輔導題目', code:'ABK-A', year:'115', semester:'1', version:'綜合版', scope:'第一章', bookTitle:'模考題本', exam:'第一次', count:1 },
    running:{left:'自然',right:'驗證'}, footer:'自然',
    sections:[{title:'單選題',score:'每題 2 分，共 2 分',items:[{no:1,kind:'choice',stem:'這是假資料題幹。',options:['(A)甲','(B)乙','(C)丙','(D)丁'],layout:{optionMode:'four'},imgs:[]}]}] };
}
function writeDocx(parts, target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zzexam-'));
  const put = (name, value) => { const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, value); };
  const headers = Object.keys(parts.headers);
  put('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${headers.map(h=>`<Override PartName="/word/${h}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${h.startsWith('footer')?'footer':'header'}+xml"/>`).join('')}</Types>`);
  put('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  put('word/document.xml', `<?xml version="1.0"?><w:document ${parts.NS}><w:body>${parts.body}</w:body></w:document>`);
  put('word/styles.xml', parts.stylesXml); put('word/numbering.xml', parts.numberingXml);
  put('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${headers.map(h=>`<Relationship Id="rId_${h}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${h.startsWith('footer')?'footer':'header'}" Target="${h}.xml"/>`).join('')}</Relationships>`);
  headers.forEach(h => put(`word/${h}.xml`, `<?xml version="1.0"?><w:${h.startsWith('footer')?'ftr':'hdr'} ${parts.NS}>${parts.headers[h]}</w:${h.startsWith('footer')?'ftr':'hdr'}>`));
  const zip = spawnSync('zip', ['-q', '-r', target, '.'], {cwd:dir});
  if (zip.status !== 0) throw new Error(zip.stderr.toString() || 'zip failed');
  fs.rmSync(dir, {recursive:true,force:true});
}
const out = path.join(__dirname, '..', '_work', 'word'); fs.mkdirSync(out, {recursive:true});
for (const kind of ['formal','abk','pre','golden','mock']) writeDocx(Z.buildParts(spec(kind)), path.join(out, `zzexam-${kind}.docx`));
const solution = {kind:'solution',style:'formal',field:'自然',title:'假資料詳解',meta:{title:'假資料詳解',scope:'第一章',answers:['A']},running:{left:'詳解',right:''},footer:'自然',solutions:[{no:1,answer:'A',detail:'假資料詳解',options:[]}]};
writeDocx(Z.buildParts(solution), path.join(out, 'zzexam-solution.docx'));
console.log(out);
