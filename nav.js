/* 茲茲題庫：各系統之間的快速切換列（2026-11-13）
   首頁（home.html）不顯示；頁首的回首頁按鈕保留，考卷前處理頁首不改。
   手機／平板直向（<900px）：固定在底部；電腦版：放在頁首下方的分頁標籤。
   在 iframe 裡（例如前處理背景載入的題庫、組卷精靈內嵌）不顯示。 */
(function () {
  if (window.top !== window) return;
  if (/[?&]embed=1\b/.test(location.search)) return;
  const page = (location.pathname.split('/').pop() || 'home.html').toLowerCase();
  if (page === 'home.html' || page === 'index.htm') return;   // 首頁只在一開始用大拼圖入口，不顯示切換列
  const compose = /[?&]mode=compose\b/.test(location.search);
  const ICON = {
    raw: '<path d="M4 4h5M4 4v5M20 4h-5M20 4v5M4 20h5M4 20v-5M20 20h-5M20 20v-5"/><path d="M8 12h8M12 8v8"/>',
    bank: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
    prog: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 8h5M8 12h5M8 16h3M15.5 15.5l1.2 1.2 2.3-2.6"/>',
    comp: '<path d="M4 5h7M4 5v14M4 12h7M4 19h7M14 4l6 3-6 3zM14 14l6 3-6 3z"/>',
    sol: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 15h7M9 19h4"/>'
  };
  const ITEMS = [
    { key: 'raw', label: '前處理', href: 'raw.html', on: page === 'raw.html' || page === 'raw-manual.html' },
    { key: 'bank', label: '題庫', href: 'index.html', on: page === 'index.html' && !compose },
    { key: 'prog', label: '進度', href: 'progress.html', on: page === 'progress.html' },
    { key: 'comp', label: '組卷', href: 'composer.html', on: page === 'composer.html' || (page === 'index.html' && compose) },
    { key: 'sol', label: '詳解', href: 'https://tzutzu-ocr.vercel.app/answer.html', ext: true }
  ];
  const css = `
    :root{--zznav-h:0px}
    .zznav{font-family:inherit;box-sizing:border-box;z-index:650}
    .zznav a{display:flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;color:#6e6f74;font-weight:700;-webkit-tap-highlight-color:transparent}
    .zznav svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
    .zznav a.on{color:#850103}
    @media(min-width:900px){
      .zznav{display:flex;justify-content:center;gap:4px;background:#fffefb;border-bottom:1px solid #e6e4de;padding:0 12px;overflow-x:auto}
      .zznav a{padding:11px 16px;font-size:14px;border-bottom:3px solid transparent;white-space:nowrap}
      .zznav a:hover{color:#850103;background:#faf6ef}
      .zznav a.on{border-bottom-color:#850103}
    }
    @media(max-width:899px){
      :root{--zznav-h:calc(60px + env(safe-area-inset-bottom))}
      .zznav{position:fixed;left:0;right:0;bottom:0;height:var(--zznav-h);padding-bottom:env(safe-area-inset-bottom);display:grid;grid-template-columns:repeat(5,1fr);background:rgba(255,254,251,.97);border-top:1px solid #e6e4de;box-shadow:0 -4px 16px rgba(43,32,28,.06);backdrop-filter:blur(8px)}
      .zznav a{flex-direction:column;gap:3px;font-size:11.5px;line-height:1.1}
      .zznav svg{width:23px;height:23px}
      body.has-zznav{padding-bottom:var(--zznav-h)!important}
      body.has-zznav .float{bottom:var(--zznav-h)!important}
      body.has-zznav .dehand-actions{bottom:var(--zznav-h)}
    }
    body.has-zznav header .hdr-compose-btn,body.has-zznav header a.qbank-icon{display:none!important}
    @media(max-width:899px){body.has-zznav header .sub,body.has-zznav header .hdr-text .sub,body.has-zznav header .hdr-text::after{display:none!important}}
    body.has-zznav #composer-frame{height:calc(100% - var(--zznav-h) - var(--zznav-top,0px))}`;
  function mount() {
    if (document.querySelector('.zznav')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const nav = document.createElement('nav'); nav.className = 'zznav'; nav.setAttribute('aria-label', '切換系統');
    nav.innerHTML = ITEMS.map(it => `<a href="${it.href}"${it.ext ? ' target="_blank" rel="noopener"' : ''}${it.on ? ' class="on" aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[it.key]}</svg><span>${it.label}</span></a>`).join('');
    const header = document.querySelector('body > header') || document.querySelector('header');
    if (header && header.parentNode) header.after(nav); else document.body.prepend(nav);
    document.body.classList.add('has-zznav');
    const fit = () => document.documentElement.style.setProperty('--zznav-top', innerWidth >= 900 ? nav.offsetHeight + 'px' : '0px');
    fit(); addEventListener('resize', fit);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
