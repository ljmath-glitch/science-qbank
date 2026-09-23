#!/usr/bin/env node
// 茲茲題庫：對每個 HTML 檔抽出 inline <script>（跳過 src= 外部腳本）跑 node --check。
// 用法：node syntax_check.mjs [檔案...]   不給檔案則自動掃 repo 根目錄所有 *.html
// 結束碼：全部通過=0，有任一檔語法錯=1。
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';

// repo 根目錄 = 這支腳本的 ../../../..（.claude/skills/qbank-selftest/scripts/ 往上四層）
const ROOT = resolve(new URL('../../../../', import.meta.url).pathname);
const args = process.argv.slice(2);
const files = args.length
  ? args.map(f => resolve(f))
  : readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => join(ROOT, f));

// 抓 <script> 內容，但排除有 src= 的（外部檔）。與 CLAUDE.md 第10節同邏輯。
const SCRIPT_RE = /<script(?:(?!src=)[^>])*>([\s\S]*?)<\/script>/gi;
const tmp = mkdtempSync(join(tmpdir(), 'qbank-check-'));
let bad = 0;

for (const file of files) {
  let html;
  try { html = readFileSync(file, 'utf8'); }
  catch { console.log(`⚠️  讀不到 ${file}，略過`); continue; }
  const blocks = [...html.matchAll(SCRIPT_RE)].map(m => m[1]);
  if (!blocks.length) { console.log(`—  ${basename(file)}：無 inline script`); continue; }
  const jsPath = join(tmp, basename(file) + '.js');
  writeFileSync(jsPath, blocks.join('\n;\n'));
  try {
    execFileSync('node', ['--check', jsPath], { stdio: 'pipe' });
    console.log(`✅ ${basename(file)}：${blocks.length} 個 script 區塊，語法 OK`);
  } catch (e) {
    bad++;
    console.log(`❌ ${basename(file)}：語法錯誤`);
    console.log((e.stderr || e.stdout || String(e)).toString().trim().split('\n').slice(0, 6).join('\n'));
  }
}

console.log(bad ? `\n✗ ${bad} 個檔案有語法錯誤` : `\n✓ 全部通過（${files.length} 檔）`);
process.exit(bad ? 1 : 0);
