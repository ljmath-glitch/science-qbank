/* =====================================================================
 * 茲茲數學工具嵌入（題庫端）：開啟工具、收發 postMessage、驗證訊息
 * ---------------------------------------------------------------------
 * 通訊格式：課務系統 repo 的 docs/mt-embed-protocol.md（v1）。
 * 題庫端說明：docs/mt-embed.md。
 *
 * 這支檔案只負責「開工具 → 拿回結果」，不碰題庫資料；
 * 存圖、插公式等由 index.html 的「茲茲數學工具整合」區塊處理。
 * 任何取消／錯誤／逾時／視窗被關掉，都只回傳狀態，呼叫端一律不改資料。
 * ===================================================================== */
(function () {
  'use strict';

  // ====== 設定（只在這裡改） ======
  // 允許的工具來源（精確比對，不用萬用字元）。第一個是正式站。
  var TOOL_ORIGINS = [
    'https://tzutzu-course-system.vercel.app', // 正式站
    'http://localhost:8766',                   // 本機開發用
  ];
  // 空字串＝用正式站（工具正式站已有 /mt-embed.html，2026-10-10 起）。
  // ⚠️ 不要再指向 Vercel 預覽網址（…-git-…vercel.app）：預覽版會被 Vercel 的保留期限自動刪掉，
  //   題庫就會出現「410 GONE / This deployment was removed」（2026-10-10 發生過）。
  // 要改連本機開發版時，把這裡改成 'http://localhost:8766'（必須在上面清單內）。
  var TOOL_ORIGIN_OVERRIDE = '';
  var TOOL_ORIGIN = (TOOL_ORIGIN_OVERRIDE && TOOL_ORIGINS.indexOf(TOOL_ORIGIN_OVERRIDE) >= 0) ? TOOL_ORIGIN_OVERRIDE : TOOL_ORIGINS[0];

  var PROTO = 1;                              // 訊息格式版本
  var SRC_SELF = 'science-qbank';             // 題庫送出的 source
  var SRC_TOOL = 'tzutzu-math-studio';        // 工具送出的 source
  var READY_TIMEOUT_MS = 10 * 60 * 1000;      // 等工具 READY（含登入時間）
  var TOTAL_TIMEOUT_MS = 60 * 60 * 1000;      // 整個工作階段上限，逾時當取消
  var MAX_PNG_CHARS = 11 * 1024 * 1024;       // data URL 字串長度上限（工具端 PNG 上限 8 MB）
  var MAX_CONFIG_CHARS = 500000;              // config JSON 上限（與工具端一致）
  var MAX_LATEX = 20000;                      // latex 字數上限
  var MAX_PX = 30000;                         // 圖片像素寬高上限（防呆）
  var PNG_PREFIX = 'data:image/png;base64,';

  var S = null; // 目前的工作階段（一次只開一個）

  function newRid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function toolUrl(mode, rid) {
    return TOOL_ORIGIN + '/mt-embed.html?origin=' + encodeURIComponent(location.origin) + '&rid=' + encodeURIComponent(rid) + '&mode=' + mode;
  }
  function isPlainObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function posNum(n, max) { return typeof n === 'number' && isFinite(n) && n > 0 && n <= max; }

  // ====== 驗證工具送來的 DONE，回傳整理過的資料（不合格回 null） ======
  function checkFig(m) {
    if (m.kind !== 'fig') return null;
    if (typeof m.png !== 'string' || m.png.indexOf(PNG_PREFIX) !== 0 || m.png.length >= MAX_PNG_CHARS || m.png.length <= PNG_PREFIX.length) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(m.png.slice(PNG_PREFIX.length))) return null;
    if (!posNum(m.width, MAX_PX) || !posNum(m.height, MAX_PX)) return null;
    if (typeof m.figureId !== 'string' || !/^[\w-]{1,80}$/.test(m.figureId)) return null;
    if (!isPlainObj(m.config) || m.config.v !== 1 || typeof m.config.t !== 'string' || !m.config.t) return null;
    var cfgJson;
    try { cfgJson = JSON.stringify(m.config); } catch (e) { return null; }
    if (!cfgJson || cfgJson.length > MAX_CONFIG_CHARS) return null;
    var widthCm = posNum(m.widthCm, 200) ? m.widthCm : null;
    return { kind: 'fig', png: m.png, width: m.width, height: m.height, widthCm: widthCm, figureId: m.figureId, config: JSON.parse(cfgJson) };
  }
  function checkEq(m) {
    if (m.kind !== 'eq' || typeof m.latex !== 'string' || m.latex.length > MAX_LATEX) return null;
    // 工具送來的是不含 $ 的 LaTeX；保險起見去掉外層 $，並把換行改成空白（題庫是行內公式）
    var latex = m.latex.replace(/[\r\n]+/g, ' ').trim().replace(/^\$+|\$+$/g, '').trim();
    if (!latex) return null;
    if (/(^|[^\\])\$/.test(latex)) return null; // 內含未跳脫的 $ 會把題目的 $…$ 拆壞
    var editorLatex = typeof m.editorLatex === 'string' && m.editorLatex.length <= MAX_LATEX ? m.editorLatex : '';
    return { kind: 'eq', latex: latex, editorLatex: editorLatex };
  }

  // ====== 畫面：iframe 視窗（dialog，才能蓋在其他已開啟的 dialog 上面） ======
  var CSS = '#mtEmbedDlg{padding:0;border:0;border-radius:12px;width:min(1280px,96vw);height:min(880px,92vh);max-width:96vw;max-height:92vh;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.35)}'
    + '#mtEmbedDlg::backdrop{background:rgba(20,20,20,.45)}'
    + '#mtEmbedDlg .mt-wrap{display:flex;flex-direction:column;height:100%}'
    + '#mtEmbedDlg .mt-head{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#850103;color:#fff;font-size:14px;font-family:inherit}'
    + '#mtEmbedDlg .mt-head b{flex:1}'
    + '#mtEmbedDlg .mt-head button{font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;cursor:pointer}'
    + '#mtEmbedDlg .mt-head button:hover{background:rgba(255,255,255,.15)}'
    + '#mtEmbedDlg .mt-body{flex:1;position:relative;background:#f6f5f2}'
    + '#mtEmbedDlg iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}'
    + '#mtEmbedDlg .mt-wait{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:14px;color:#444;text-align:center;padding:20px}'
    + '#mtEmbedDlg .mt-wait button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}';

  function ensureDlg() {
    var d = document.getElementById('mtEmbedDlg');
    if (d) return d;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    d = document.createElement('dialog'); d.id = 'mtEmbedDlg';
    d.innerHTML = '<div class="mt-wrap"><div class="mt-head"><b id="mtEmbedTitle">茲茲數學工具</b>'
      + '<button type="button" id="mtEmbedPopupBtn" title="iframe 內無法登入（例如 Safari）時使用">在新視窗開啟</button>'
      + '<button type="button" id="mtEmbedCloseBtn">關閉（不插入）</button></div>'
      + '<div class="mt-body" id="mtEmbedBody"></div></div>';
    document.body.appendChild(d);
    // Esc 關閉＝取消
    d.addEventListener('cancel', function (e) { e.preventDefault(); if (S) finish({ status: 'cancel', reason: 'user' }); });
    d.querySelector('#mtEmbedCloseBtn').onclick = function () { if (S) finish({ status: 'cancel', reason: 'user' }); };
    d.querySelector('#mtEmbedPopupBtn').onclick = function () { if (S) switchToPopup(); };
    return d;
  }

  // ====== 工作階段 ======
  function post(type, extra) {
    if (!S || !S.win) return;
    var m = { source: SRC_SELF, v: PROTO, type: type, requestId: S.rid };
    for (var k in (extra || {})) m[k] = extra[k];
    try { S.win.postMessage(m, TOOL_ORIGIN); } catch (e) {}
  }
  function onMessage(e) {
    if (!S) return;
    if (e.origin !== TOOL_ORIGIN) return;             // 來源網址精確比對
    if (!S.win || e.source !== S.win) return;          // 必須是自己開的那個 iframe／視窗
    var m = e.data;
    if (!isPlainObj(m) || m.source !== SRC_TOOL || m.v !== PROTO || m.requestId !== S.rid) return;
    if (m.type === 'READY') {
      if (S.initSent) return;                         // INIT 只送一次，重複 READY 不理
      if (m.mode !== S.mode) return;
      S.initSent = true;
      clearTimeout(S.readyTimer);
      post('INIT', { mode: S.mode, data: S.initData });
      return;
    }
    if (m.type === 'DONE') {
      if (!S.initSent) return;                        // 還沒 INIT 就來的 DONE 不理
      var r = S.mode === 'fig' ? checkFig(m) : checkEq(m);
      if (!r) return finish({ status: 'error', code: 'BAD_DATA', message: '工具回傳的資料格式不正確，未做任何變更。' });
      r.status = 'done';
      return finish(r);
    }
    if (m.type === 'CANCEL') return finish({ status: 'cancel', reason: m.reason === 'closed' ? 'closed' : 'user' });
    if (m.type === 'ERROR') {
      var code = typeof m.code === 'string' ? m.code.slice(0, 40) : 'ERROR';
      var msg = typeof m.message === 'string' ? m.message.slice(0, 300) : '';
      if (code === 'UNAUTHORIZED') msg = '這個帳號沒有數學工具的使用權限。' + (msg ? '（' + msg + '）' : '');
      return finish({ status: 'error', code: code, message: msg || '數學工具發生錯誤。' });
    }
    // 其他 type：忽略
  }
  function armTimers() {
    clearTimeout(S.readyTimer); clearTimeout(S.totalTimer);
    S.readyTimer = setTimeout(function () { if (S && !S.initSent) finish({ status: 'timeout', message: '等候數學工具逾時（10 分鐘內未完成登入／載入），已取消，資料未變更。' }); }, READY_TIMEOUT_MS);
    S.totalTimer = setTimeout(function () { if (S) finish({ status: 'timeout', message: '數學工具開啟過久已自動取消，資料未變更。' }); }, TOTAL_TIMEOUT_MS);
  }
  function mountIframe() {
    var body = document.getElementById('mtEmbedBody');
    body.innerHTML = '';
    var f = document.createElement('iframe');
    f.title = '茲茲數學工具';
    f.referrerPolicy = 'no-referrer';
    f.src = toolUrl(S.mode, S.rid);
    body.appendChild(f);
    S.frame = f; S.win = f.contentWindow;
  }
  function switchToPopup() {
    // 換新的 requestId：舊 iframe 送來的任何訊息（例如關閉時的 CANCEL）都會被忽略
    var body = document.getElementById('mtEmbedBody');
    S.rid = newRid(); S.initSent = false; S.frame = null; S.win = null;
    body.innerHTML = '';
    var w = window.open(toolUrl(S.mode, S.rid), 'mtEmbed_' + S.rid, 'width=1240,height=860');
    if (!w) {
      body.innerHTML = '<div class="mt-wait">瀏覽器擋下了彈出視窗。請允許本網站開啟彈出視窗後再按一次「在新視窗開啟」。</div>';
      return;
    }
    S.popup = w; S.win = w;
    body.innerHTML = '<div class="mt-wait"><div>已在新視窗開啟茲茲數學工具。<br>完成後會自動帶回這裡；關掉那個視窗＝取消。</div>'
      + '<button type="button" id="mtEmbedFocusBtn">切換到工具視窗</button></div>';
    document.getElementById('mtEmbedFocusBtn').onclick = function () { try { w.focus(); } catch (e) {} };
    document.getElementById('mtEmbedPopupBtn').style.display = 'none';
    armTimers();
    clearInterval(S.poll);
    S.poll = setInterval(function () {
      // 視窗被關掉：稍等一下讓最後的 DONE／CANCEL 訊息先到
      if (S && S.popup && S.popup.closed) { clearInterval(S.poll); setTimeout(function () { if (S && S.popup === w) finish({ status: 'cancel', reason: 'closed' }); }, 600); }
    }, 500);
  }
  function finish(result) {
    var s = S; if (!s) return;
    S = null;
    window.removeEventListener('message', onMessage);
    clearTimeout(s.readyTimer); clearTimeout(s.totalTimer); clearInterval(s.poll);
    if (s.popup && !s.popup.closed) { try { s.popup.close(); } catch (e) {} }
    var d = document.getElementById('mtEmbedDlg');
    if (d) {
      var body = document.getElementById('mtEmbedBody'); if (body) body.innerHTML = ''; // 拿掉 iframe
      if (d.open) d.close();
    }
    s.resolve(result);
  }

  /**
   * 開啟茲茲數學工具。
   * @param {'fig'|'eq'} mode
   * @param {object} data  新增繪圖 {}；回編 {config, figureId}；數學式 {latex}
   * @returns {Promise<object>} status: 'done' | 'cancel' | 'error' | 'timeout' | 'busy'
   */
  function open(mode, data) {
    if (mode !== 'fig' && mode !== 'eq') return Promise.resolve({ status: 'error', code: 'BAD_MODE', message: 'mode 不正確' });
    if (S) { try { if (S.popup) S.popup.focus(); } catch (e) {} return Promise.resolve({ status: 'busy', message: '數學工具已經開著了。' }); }
    // INIT 只帶這些欄位，絕不帶題目內容或任何帳號憑證
    var init = {};
    data = data || {};
    if (mode === 'fig' && data.config) {
      if (!isPlainObj(data.config) || JSON.stringify(data.config).length > MAX_CONFIG_CHARS) return Promise.resolve({ status: 'error', code: 'BAD_DATA', message: '這張圖的設定資料不正確，無法回編。' });
      init.config = data.config;
      if (typeof data.figureId === 'string' && /^[\w-]{1,80}$/.test(data.figureId)) init.figureId = data.figureId;
    }
    if (mode === 'eq' && typeof data.latex === 'string' && data.latex) init.latex = data.latex.slice(0, MAX_LATEX);
    return new Promise(function (resolve) {
      var d = ensureDlg();
      S = { mode: mode, rid: newRid(), initData: init, initSent: false, resolve: resolve, win: null, frame: null, popup: null };
      document.getElementById('mtEmbedTitle').textContent = (mode === 'eq' ? (init.latex ? '編輯數學式' : '插入數學式') : (init.config ? '編輯繪圖' : '插入繪圖')) + '｜茲茲數學工具';
      document.getElementById('mtEmbedPopupBtn').style.display = '';
      window.addEventListener('message', onMessage);
      d.showModal();
      mountIframe();
      armTimers();
    });
  }

  window.MTEmbed = {
    open: open,
    TOOL_ORIGIN: TOOL_ORIGIN,
    PAPER_CONTENT_CM: 17, // 預設版心寬（A4 左右各 2 cm 邊界），用來把工具建議的公分寬換成 % 寬
    isOpen: function () { return !!S; },
    cancel: function () { if (S) finish({ status: 'cancel', reason: 'user' }); },
    // 測試用：縮短逾時（只接受正數）
    _setTimeouts: function (readyMs, totalMs) { if (readyMs > 0) READY_TIMEOUT_MS = readyMs; if (totalMs > 0) TOTAL_TIMEOUT_MS = totalMs; },
    _checkFig: checkFig,
    _checkEq: checkEq
  };
})();
