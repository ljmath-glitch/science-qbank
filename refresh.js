/* 茲茲題庫系統 — 全站共用「重新整理」鈕（單檔自足，仿 patchnotes.js）
   用法：任何頁面在 </body> 前加一行 <script src="refresh.js" defer></script>（建議放在 patchnotes.js 之後）。
   行為：
   - 在標頭（更新禮物左側）放一顆「重新整理」鈕。
   - 按下去：
       · 若本頁有定義 window.qbankRefresh()（就地重抓本頁資料、保留篩選與捲動）→ 呼叫它，不整頁重載、不閃爍、不會被踢回首頁。
       · 否則 → 先記住捲動位置再整頁重載，載入後自動捲回原位（整頁重載也停在原地）。
   - 不做任何自動輪詢，只有使用者主動按才會重抓（避免造成雲端流量負擔）。
*/
(function () {
  var SKEY = 'tzqr_sy_' + location.pathname;

  // 整頁重載路徑：還原捲動位置
  try {
    var sv = sessionStorage.getItem(SKEY);
    if (sv) {
      sessionStorage.removeItem(SKEY);
      var restore = function () {
        var y = parseInt(sv, 10) || 0;
        setTimeout(function () { window.scrollTo(0, y); }, 80);
        setTimeout(function () { window.scrollTo(0, y); }, 450);
      };
      if (document.readyState === 'complete') restore();
      else window.addEventListener('load', restore);
    }
  } catch (e) {}

  function addCss() {
    if (document.getElementById('tzqrCss')) return;
    var s = ''
      + '.tzqr-btn{width:36px;height:36px;padding:0;border-radius:9px;border:1px solid transparent;cursor:pointer;background:transparent;color:var(--ink,#303238);box-shadow:none;display:flex;align-items:center;justify-content:center;font:inherit;z-index:2;flex:0 0 auto;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}'
      + '.tzqr-header-aligned{align-items:center}'
      + '.tzqr-header-aligned>.hdr-compose-btn{height:36px;display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:filter .16s ease,transform .16s ease,box-shadow .16s ease}'
      + '.tzqr-header-aligned>.hdr-compose-btn:hover{filter:brightness(1.16);transform:translateY(-1px);box-shadow:0 5px 12px -5px rgba(133,1,3,.55)!important}'
      + '.tzqr-header-aligned>.hdr-compose-btn:active{filter:brightness(.9);transform:translateY(0) scale(.97);box-shadow:inset 0 2px 4px rgba(60,0,0,.22)!important}'
      + '.tzqr-header-aligned>.hdr-compose-btn:focus-visible{outline:3px solid rgba(133,1,3,.28);outline-offset:3px}'
      + '.tzqr-header-aligned>.bell-wrap{height:36px;display:flex;align-items:center;line-height:1}'
      + '.tzqr-header-aligned>.index-home-link,.tzqr-header-aligned>button.bell-btn,.tzqr-header-aligned>.bell-wrap>.bell-btn{width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;flex:0 0 36px}'
      + '.tzqr-header-aligned>.tzpn-btn{width:36px;height:36px;flex:0 0 36px;border-radius:9px;align-self:center}'
      + '.tzqr-header-aligned>.index-home-link svg,.tzqr-header-aligned>button.bell-btn svg,.tzqr-header-aligned>.bell-wrap>.bell-btn svg,.tzqr-header-aligned>.tzpn-btn svg{width:21px;height:21px;display:block}'
      + '.tzqr-btn:hover{background:var(--cream,#faf8f4);border-color:var(--line,#e6dfd5);color:var(--red,#850103)}'
      + '.tzqr-btn:active{background:#f3e9e3;color:var(--red,#850103);transform:scale(.94)}'
      + '.tzqr-btn:focus-visible{outline:3px solid rgba(133,1,3,.28);outline-offset:2px}'
      + '.tzqr-btn--abs{position:absolute;top:50%;right:66px;transform:translateY(-50%)}'
      + '.tzqr-btn--abs:active{transform:translateY(-50%) scale(.94)}'
      + '.tzqr-btn.spin{pointer-events:none;color:var(--red,#850103);background:var(--cream,#faf8f4)}'
      + '.tzqr-btn.spin svg{animation:tzqrspin .7s linear infinite;transform-origin:50% 50%}'
      + '@keyframes tzqrspin{to{transform:rotate(360deg)}}'
      + '@media(max-width:560px){.tzqr-btn--abs{right:56px}}'
      + '@media(prefers-reduced-motion:reduce){.tzqr-btn,.tzqr-header-aligned>.hdr-compose-btn{transition:none}.tzqr-header-aligned>.hdr-compose-btn:hover,.tzqr-header-aligned>.hdr-compose-btn:active{transform:none}.tzqr-btn.spin svg{animation:none}}';
    var st = document.createElement('style'); st.id = 'tzqrCss'; st.textContent = s;
    document.head.appendChild(st);
  }

  function icon() {
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.36"/><path d="M21 3v6h-6"/></svg>';
  }

  function doRefresh() {
    var btn = document.getElementById('tzqrBtn');
    if (btn) btn.classList.add('spin');
    if (typeof window.qbankRefresh === 'function') {
      Promise.resolve().then(function () { return window.qbankRefresh(); })
        .catch(function (e) { console.error('qbankRefresh failed', e); })
        .then(function () { if (btn) setTimeout(function () { btn.classList.remove('spin'); }, 350); });
    } else {
      try { sessionStorage.setItem(SKEY, String(window.scrollY || window.pageYOffset || 0)); } catch (e) {}
      location.reload();
    }
  }

  function inject() {
    if (document.getElementById('tzqrBtn')) return;
    addCss();
    var btn = document.createElement('button');
    btn.id = 'tzqrBtn';
    btn.className = 'tzqr-btn';
    btn.type = 'button';
    btn.title = '重新整理（重抓本頁資料，保留目前的篩選與捲動位置）';
    btn.setAttribute('aria-label', '重新整理');
    btn.innerHTML = icon();
    btn.addEventListener('click', doRefresh);

    // 依序挑最適合的「標頭內層容器」。用逐一 || 而非逗號選擇器，避免 querySelector
    // 依文件順序先回傳 <header> 本身（block，非 flex）而把按鈕擠成絕對定位、被內容蓋住。
    var host = document.querySelector('header .daily-actions')
      || document.querySelector('header .header-actions')
      || document.querySelector('header .wrap')
      || document.querySelector('header .bar')
      || document.querySelector('header');
    if (!host) {
      // 沒有標頭（例如全螢幕頁）：固定在右上角，仍可用。
      btn.style.position = 'fixed';
      btn.style.top = '12px';
      btn.style.right = '74px';
      btn.style.zIndex = '2147482000';
      document.body.appendChild(btn);
      return;
    }
    if (host.querySelector('.hdr-text')) host.classList.add('tzqr-header-aligned');
    var isFlex = (getComputedStyle(host).display || '').indexOf('flex') > -1;
    if (isFlex) {
      // 標頭是 flex：直接當 flex 子元素塞在最右邊（in-flow，一定點得到）。
      btn.style.marginLeft = host.classList.contains('tzqr-header-aligned') ? '0' : 'auto';
      host.appendChild(btn);
    } else {
      // 非 flex 標頭：絕對定位在右上，留在禮物鈕左側。
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      if (!host.style.paddingRight) host.style.paddingRight = '124px';
      btn.classList.add('tzqr-btn--abs');
      host.appendChild(btn);
    }
    tidyWithGift();
  }

  // 禮物鈕（patchnotes）是非同步注入的；等它出現後，把「重新整理」排到它左邊、緊貼併排。
  function tidyWithGift() {
    var btn = document.getElementById('tzqrBtn');
    var gift = document.querySelector('.tzpn-btn');
    if (!btn || !gift || gift.parentNode !== btn.parentNode) return;
    if (btn.classList.contains('tzqr-btn--abs')) {
      // 絕對定位版：禮物在 right:12，重新整理在 right:66，本來就錯開，不用動。
      return;
    }
    gift.style.marginLeft = btn.parentNode.classList.contains('tzqr-header-aligned') ? '0' : '8px';
    if (gift.previousElementSibling !== btn) btn.parentNode.insertBefore(btn, gift);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
  // 保險：禮物鈕較晚才出現，分幾次校正位置關係。
  setTimeout(tidyWithGift, 800);
  setTimeout(tidyWithGift, 1800);
  setTimeout(tidyWithGift, 3500);
})();
