#!/usr/bin/env node
/* 解密「主機電腦安裝包」：node decrypt-host-package.js <zizi-host-windows.zip.enc> <輸出.zip>
 * 密碼以隱藏方式輸入（不會顯示、不會留在命令列紀錄）；也可用環境變數 ZZ_PW（給自動化用）。
 * 格式：'ZZ1\0'(4) + 迭代次數 uint32(4) + salt(16) + iv(12) + 密文 + GCM tag(16)；PBKDF2-SHA256 → AES-256-GCM。 */
const crypto = require('crypto'), fs = require('fs');
const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error('用法：node decrypt-host-package.js <安裝包.zip.enc> <輸出.zip>'); process.exit(2); }
function askPassword() {
  return new Promise((ok, no) => {
    if (process.env.ZZ_PW) return ok(process.env.ZZ_PW);
    if (!process.stdin.isTTY) return no(new Error('請在互動式終端機執行，才能隱藏輸入密碼。'));
    process.stdout.write('管理員密碼（輸入時不會顯示）：');
    let v = ''; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const on = (d) => { for (const ch of d) {
      if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', on); process.stdout.write('\n'); return ok(v); }
      if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      if (ch === '\u007f' || ch === '\b') v = v.slice(0, -1); else v += ch; } };
    process.stdin.on('data', on);
  });
}
(async () => {
  const buf = fs.readFileSync(inFile);
  if (buf.slice(0, 3).toString('latin1') !== 'ZZ1') throw new Error('檔案格式不對（不是主機安裝包）。');
  const iter = buf.readUInt32BE(4), salt = buf.slice(8, 24), iv = buf.slice(24, 36);
  const tag = buf.slice(buf.length - 16), ct = buf.slice(36, buf.length - 16);
  const pw = await askPassword();
  const key = crypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  let out; try { out = Buffer.concat([d.update(ct), d.final()]); } catch (e) { throw new Error('密碼不對。'); }
  fs.writeFileSync(outFile, out); console.log('完成：' + outFile + '（' + (out.length / 1e6).toFixed(1) + ' MB）');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
