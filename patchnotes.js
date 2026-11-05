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
  var TAGC = { '新功能': '#1f8f4e', '修正': '#c06a12', '優化': '#2563c9', '公告': '#850103' };
  var TAGBG = { '新功能': '#e4f4ea', '修正': '#fbeedd', '優化': '#e7effb', '公告': '#f7e4e4' };
  // 白色線條圖示（放在品牌紅方塊裡，顏色統一、但「依功能類型換不同圖案」）
  var IW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    '新功能': IW + '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/></svg>',        // 星星
    '優化':   IW + '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',                   // 向上趨勢
    '修正':   IW + '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>', // 扳手
    '公告':   IW + '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'           // 鈴鐺
  };
  var DEFAULT_ICON = IW + '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
  function iconFor(tag) { return ICONS[tag] || DEFAULT_ICON; }
  var GIFT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M12 8S10.8 4.5 8.5 4.5a2 2 0 1 0 0 3.5H12Zm0 0s1.2-3.5 3.5-3.5a2 2 0 1 1 0 3.5H12Z"/></svg>';
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
    + '.tzpn-btn{position:relative;flex:0 0 46px;margin-left:auto;z-index:1;width:46px;height:46px;border-radius:13px;border:1px solid #efe5df;cursor:pointer;background:#fff8f4;color:#7d1833;box-shadow:0 3px 12px rgba(45,48,56,.08);display:none;align-items:center;justify-content:center;font:inherit}'
    + '.tzpn-btn.ready{display:flex}'
    + '.tzpn-btn:hover{background:#fff0e9;border-color:#e7d2c8}'
    + '.tzpn-btn:focus-visible{outline:3px solid rgba(133,1,3,.28);outline-offset:2px}'
    + '.tzpn-btn.tzpn-btn--absolute{position:absolute;top:50%;right:12px;transform:translateY(-50%);margin:0}'
    + '.tzpn-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ffcf33;color:#5e0102;font:800 11px/1 inherit;display:none;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}'
    + '.tzpn-mask{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:16px}'
    + '.tzpn-mask.show{display:flex}'
    + '.tzpn-head:after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 85% 20%,rgba(255,255,255,.35),transparent 45%);pointer-events:none}'
    + '.tzpn-item.new .tzpn-ic{background:#b91c1c;color:#fff}'
    + '.tzpn-card{width:100%;max-width:460px;max-height:86vh;background:#fff;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;color:#1e293b}'
    + '.tzpn-head{flex-shrink:0;position:relative;padding:22px 22px 18px;background:linear-gradient(135deg,#7a0003 0%,#b91c1c 55%,#f59e0b 130%);color:#fff;overflow:hidden}'
    + '.tzpn-kicker{font-size:11px;letter-spacing:.25em;opacity:.85;font-weight:900}'
    + '.tzpn-title{font-size:22px;font-weight:900;margin:4px 0 0}'
    + '.tzpn-sub{font-size:12px;font-weight:700;margin-top:4px;opacity:.9;max-width:calc(100% - 50px)}'
    + '.tzpn-gift{position:absolute;right:18px;top:16px;width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1}'
    + '.tzpn-gift svg{width:24px;height:24px}'
    + '.tzpn-x{position:absolute;right:12px;bottom:12px;z-index:2;border:0;background:rgba(0,0,0,.2);color:#fff;width:28px;height:28px;border-radius:999px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center}'
    + '.tzpn-body{flex:1 1 auto;min-height:0;padding:14px 18px 6px;overflow-y:auto;background:#fff}'
    + '.tzpn-row{margin:6px 0 14px}'
    + '.tzpn-daterow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:900;color:#64748b;margin-bottom:6px}'
    + '.tzpn-date{background:#1e293b;color:#fff;border-radius:8px;padding:2px 8px;font-size:12px;font-weight:900}'
    + '.tzpn-new{background:#ef4444;color:#fff;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:900}'
    + '.tzpn-item{display:flex;gap:10px;padding:10px 12px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:6px}'
    + '.tzpn-item.new{background:linear-gradient(90deg,#fffbeb,#fff);border-color:#fcd34d}'
    + '.tzpn-ic{flex-shrink:0;width:34px;height:34px;border-radius:10px;background:#fef2f2;color:#b91c1c;display:flex;align-items:center;justify-content:center}'
    + '.tzpn-ic svg{width:18px;height:18px}'
    + '.tzpn-main{flex:1;min-width:0}'
    + '.tzpn-it{font-size:14px;font-weight:900;display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
    + '.tzpn-tag{font-size:10px;font-weight:900;border-radius:6px;padding:1px 6px}'
    + '.tzpn-ib{font-size:12.5px;font-weight:600;color:#475569;margin-top:3px;line-height:1.55}'
    + '.tzpn-foot{flex-shrink:0;padding:12px 18px 18px}'
    + '.tzpn-ok{width:100%;border:0;border-radius:14px;padding:12px;font-size:15px;font-weight:900;color:#fff;background:linear-gradient(90deg,#7a0003,#b91c1c);cursor:pointer;box-shadow:0 6px 16px rgba(185,28,28,.35)}'
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
  btn.setAttribute('aria-label', '近期功能更新');
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="10" width="18" height="11" rx="1.5"/><path d="M2 7h20v4H2zM12 7v14M12 7H8.5a2.5 2.5 0 1 1 2.4-3.2L12 7Zm0 0h3.5a2.5 2.5 0 1 0-2.4-3.2L12 7Z"/></svg><span class="tzpn-badge"></span>';
  var host = document.querySelector('header .daily-actions')
    || document.querySelector('header .header-actions')
    || document.querySelector('header .wrap')
    || document.querySelector('header .bar')
    || document.querySelector('header');
  if (host) {
    if (getComputedStyle(host).display.indexOf('flex') === -1) {
      host.style.position = 'relative';
      host.style.paddingRight = '70px';
      btn.classList.add('tzpn-btn--absolute');
    }
    host.appendChild(btn);
  }

  var mask = document.createElement('div'); mask.className = 'tzpn-mask';
  mask.innerHTML = '<div class="tzpn-card"><div class="tzpn-head">'
    + '<div class="tzpn-gift" aria-hidden="true">' + GIFT_ICON + '</div>'
    + '<div class="tzpn-kicker">PATCH NOTES</div><div class="tzpn-title">近期功能更新</div>'
    + '<div class="tzpn-sub" id="tzpnSub"></div><button class="tzpn-x" type="button" aria-label="關閉">✕</button></div>'
    + '<div class="tzpn-body" id="tzpnBody"></div>'
    + '<div class="tzpn-foot"><button class="tzpn-ok" type="button">收到，開始使用！</button></div></div>';
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
      var tagbg = TAGBG[e.tag] || '#f1eae4';
      return '<div class="tzpn-row"><div class="tzpn-daterow"><span class="tzpn-date">' + esc(e.date) + '</span>更新'
        + (isNew ? '<span class="tzpn-new">NEW</span>' : '') + '</div>'
        + '<div class="tzpn-item' + (isNew ? ' new' : '') + '"><div class="tzpn-ic">' + iconFor(e.tag) + '</div>'
        + '<div class="tzpn-main"><div class="tzpn-it"><span>' + esc(e.title) + '</span>'
        + (e.tag ? '<span class="tzpn-tag" style="background:' + tagbg + ';color:' + tagc + '">' + esc(e.tag) + '</span>' : '') + '</div>'
        + '<div class="tzpn-ib">' + esc(e.body).replace(/&lt;(\/?)b&gt;/g, '<$1b>') + '</div></div></div></div>';
    }).join('');
    mask.querySelector('#tzpnBody').innerHTML = html || '<div style="padding:20px;text-align:center;color:#888">目前沒有更新紀錄</div>';
    refreshBadge();
  }
  function refreshBadge() {
    var n = unseenCount(), b = btn.querySelector('.tzpn-badge');
    if (n > 0) { b.style.display = 'flex'; b.textContent = n > 9 ? '9+' : String(n); }
    else { b.style.display = 'none'; }
    var sub = mask.querySelector('#tzpnSub');
    if (sub) sub.textContent = SYS_NAME + ' · ' + (n > 0 ? ('有 ' + n + ' 項新東西等你解鎖') : '都看過了');
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
    // 使用者覺得太頻繁：不自動彈出，只留禮物鈕上的數字，要看再點。
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
          // 這個瀏覽器開過就不再累積數字：第一次用新版把舊公告全算看過；之後新公告只在本次開頁顯示，離開就算看過。
          var topId = entries.length ? entries[0].id : 0;
          try {
            if (!localStorage.getItem('tz_patchnotes_visited')) { setSeen(topId); localStorage.setItem('tz_patchnotes_visited', '1'); }
            window.addEventListener('pagehide', function () { setSeen(topId); });
          } catch (e) {}
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
