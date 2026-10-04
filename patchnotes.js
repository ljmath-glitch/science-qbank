/* 茲茲題庫系統 — 更新公告 + 新版本偵測（全站共用，單檔自足）
   用法：任何頁面在 </body> 前加一行 <script src="patchnotes.js" defer></script> 即可。
   公告資料放在同層 changelog.json：{ "build": "...", "entries": [{id,date,tag,title,body}] }。
   - 每次部署新功能：在 changelog.json 的 entries 最前面加一筆、並把 build 改成新的字串。
   - 本檔以 fetch(no-store) 直接讀 changelog.json，所以不會被瀏覽器快取卡住舊版。
*/
(function () {
  if (window.__tzPatchNotesLoaded) return;
  window.__tzPatchNotesLoaded = true;

  var SEEN_KEY = 'tz_patchnotes_seen_id';
  var SYS_NAME = window.TZ_PATCHNOTES_TITLE || '茲茲題庫系統';
  var TAGC = { '新功能': '#1f8f4e', '修正': '#d98324', '優化': '#2563c9', '公告': '#850103' };
  var LOADED_BUILD = '', entries = [], notified = false, autoOpened = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }
  function seenId() { try { return parseInt(localStorage.getItem(SEEN_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function setSeen(id) { try { localStorage.setItem(SEEN_KEY, String(id)); } catch (e) {} }
  function maxId() { return entries.reduce(function (m, e) { return Math.max(m, e.id || 0); }, 0); }
  function unseenCount() { var s = seenId(); return entries.filter(function (e) { return (e.id || 0) > s; }).length; }

  // ---- CSS ----
  var css = ''
    + '.tzpn-btn{position:fixed;left:16px;bottom:16px;z-index:9998;width:46px;height:46px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(180deg,#960205,#6d0002);color:#fff;font-size:20px;box-shadow:0 4px 14px rgba(133,1,3,.45);display:none;align-items:center;justify-content:center}'
    + '.tzpn-btn.ready{display:flex}'
    + '.tzpn-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ffcf33;color:#5e0102;font:800 11px/1 inherit;display:none;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}'
    + '.tzpn-mask{position:fixed;inset:0;z-index:10000;background:rgba(20,10,8,.55);display:none;align-items:center;justify-content:center;padding:16px}'
    + '.tzpn-mask.show{display:flex}'
    + '.tzpn-card{width:100%;max-width:460px;max-height:86vh;background:#fff;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:inherit}'
    + '.tzpn-head{background:linear-gradient(135deg,#8a0f12,#d7832f);color:#fff;padding:18px 20px;position:relative}'
    + '.tzpn-kicker{font-size:11px;letter-spacing:3px;opacity:.85;font-weight:700}'
    + '.tzpn-title{font-size:22px;font-weight:800;margin:3px 0}'
    + '.tzpn-sub{font-size:12px;opacity:.92}'
    + '.tzpn-x{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.18);color:#fff;font-size:15px;cursor:pointer}'
    + '.tzpn-body{overflow:auto;padding:14px 16px;background:#faf7f4}'
    + '.tzpn-row{margin-bottom:14px}'
    + '.tzpn-date{display:inline-block;background:#1d2433;color:#fff;font:700 12px/1 inherit;border-radius:8px;padding:4px 9px;margin-bottom:6px}'
    + '.tzpn-date .u{color:#ffcf33;margin-left:6px}'
    + '.tzpn-item{background:#fff;border:1px solid #ece6df;border-radius:12px;padding:12px 14px}'
    + '.tzpn-item.new{border-color:#f0c67a;box-shadow:0 0 0 2px rgba(240,198,122,.25)}'
    + '.tzpn-ih{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px}'
    + '.tzpn-it{font-size:15px;font-weight:800;color:#20160f}'
    + '.tzpn-tag{font:800 11px/1 inherit;color:#fff;border-radius:6px;padding:3px 7px}'
    + '.tzpn-ib{font-size:13px;line-height:1.75;color:#52463c}'
    + '.tzpn-foot{padding:12px 16px;border-top:1px solid #eee;background:#fff}'
    + '.tzpn-ok{width:100%;border:none;border-radius:12px;padding:13px;background:linear-gradient(180deg,#960205,#6d0002);color:#fff;font-size:15px;font-weight:800;cursor:pointer}'
    + '.tzpn-toast{position:fixed;right:16px;bottom:16px;z-index:10001;max-width:300px;background:#fff;border:1px solid #e3d9cf;border-left:4px solid #960205;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:12px 14px;display:none;font-family:inherit}'
    + '.tzpn-toast.show{display:block}'
    + '.tzpn-toast .tt{font-weight:800;color:#20160f;font-size:14px;margin-bottom:4px}'
    + '.tzpn-toast .td{font-size:12px;color:#6b5d50;line-height:1.6;margin-bottom:9px}'
    + '.tzpn-toast .tr{display:flex;gap:8px}'
    + '.tzpn-toast button{border:none;border-radius:8px;padding:7px 12px;font:700 13px/1 inherit;cursor:pointer}'
    + '.tzpn-toast .go{background:linear-gradient(180deg,#960205,#6d0002);color:#fff;flex:1}'
    + '.tzpn-toast .later{background:#eee;color:#555}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---- shell DOM ----
  var btn = document.createElement('button');
  btn.className = 'tzpn-btn'; btn.title = '近期功能更新'; btn.type = 'button';
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="tzpn-badge"></span>';
  document.body.appendChild(btn);

  var mask = document.createElement('div'); mask.className = 'tzpn-mask';
  mask.innerHTML = '<div class="tzpn-card"><div class="tzpn-head">'
    + '<div class="tzpn-kicker">PATCH NOTES</div><div class="tzpn-title">近期功能更新</div>'
    + '<div class="tzpn-sub" id="tzpnSub"></div><button class="tzpn-x" type="button" aria-label="關閉">✕</button></div>'
    + '<div class="tzpn-body" id="tzpnBody"></div>'
    + '<div class="tzpn-foot"><button class="tzpn-ok" type="button">好的</button></div></div>';
  document.body.appendChild(mask);

  var toast = document.createElement('div'); toast.className = 'tzpn-toast';
  toast.innerHTML = '<div class="tt">🚀 有新版本可以更新</div>'
    + '<div class="td">我們剛上線了新版本。重新整理即可取得最新功能與修正。</div>'
    + '<div class="tr"><button class="go" type="button">重新整理</button><button class="later" type="button">稍後</button></div>';
  document.body.appendChild(toast);

  // ---- render ----
  function renderBody() {
    var s0 = seenId();
    var html = entries.map(function (e) {
      var isNew = (e.id || 0) > s0;
      var tagc = TAGC[e.tag] || '#850103';
      return '<div class="tzpn-row"><span class="tzpn-date">' + esc(e.date) + ' 更新' + (isNew ? '<span class="u">NEW</span>' : '') + '</span>'
        + '<div class="tzpn-item' + (isNew ? ' new' : '') + '"><div class="tzpn-ih"><span class="tzpn-it">' + esc(e.title) + '</span>'
        + (e.tag ? '<span class="tzpn-tag" style="background:' + tagc + '">' + esc(e.tag) + '</span>' : '') + '</div>'
        + '<div class="tzpn-ib">' + esc(e.body) + '</div></div></div>';
    }).join('');
    mask.querySelector('#tzpnBody').innerHTML = html || '<div style="padding:20px;text-align:center;color:#888">目前沒有更新紀錄</div>';
    refreshBadge();
  }
  function refreshBadge() {
    var n = unseenCount(), b = btn.querySelector('.tzpn-badge');
    if (n > 0) { b.style.display = 'flex'; b.textContent = n > 9 ? '9+' : String(n); }
    else { b.style.display = 'none'; }
    var sub = mask.querySelector('#tzpnSub');
    if (sub) sub.textContent = SYS_NAME + ' · ' + (n > 0 ? ('有 ' + n + ' 項新更新') : '都看過了');
  }
  function open() { renderBody(); mask.classList.add('show'); }
  function close() {
    mask.classList.remove('show');
    setSeen(maxId());
    renderBody();
  }
  btn.addEventListener('click', open);
  mask.querySelector('.tzpn-x').addEventListener('click', close);
  mask.querySelector('.tzpn-ok').addEventListener('click', close);
  mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
  toast.querySelector('.go').addEventListener('click', function () { location.reload(); });
  toast.querySelector('.later').addEventListener('click', function () { toast.classList.remove('show'); });

  window.TZPatchNotes = { open: open, close: close };

  function maybeAutoOpen() {
    if (autoOpened) return;
    autoOpened = true;
    // 啟動流程（組卷精靈 / 匯入交接）進行中就不自動彈，只留角落徽章
    var s = location.search || '';
    if (s.indexOf('mode=compose') > -1 || s.indexOf('handoff=') > -1) return;
    if (unseenCount() > 0) setTimeout(open, 1200);
  }

  // ---- load + update detection ----
  function fetchChangelog(first) {
    fetch('changelog.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        if (first) {
          LOADED_BUILD = d.build || '';
          entries = (d.entries || []).slice().sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
          btn.classList.add('ready');
          renderBody();
          maybeAutoOpen();
        } else if (LOADED_BUILD && d.build && d.build !== LOADED_BUILD && !notified) {
          notified = true;
          toast.classList.add('show');
        }
      })
      .catch(function () {});
  }

  fetchChangelog(true);
  setInterval(function () { fetchChangelog(false); }, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') fetchChangelog(false); });
  window.addEventListener('focus', function () { fetchChangelog(false); });
  setTimeout(function () { fetchChangelog(false); }, 15000);
})();
