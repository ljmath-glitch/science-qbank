/* iPad「加入主畫面」模式無法可靠地處理 <a download>，改由分享面板存檔。 */
(() => {
  const standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;

  const downloadPath = /\/api\/(?:py-ocr\/(?:download|qbank-xlsx)|exam-package\/download)(?:[/?#]|$)/i;
  const downloadFile = /\.(?:docx|xlsx|zip|pdf|txt)(?:[?#]|$)/i;
  let activeUrl = '';

  const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const filenameFromDisposition = value => {
    if (!value) return '';
    const utf8 = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
    const plain = value.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    try { return decodeURIComponent((utf8 && utf8[1] || plain && (plain[1] || plain[2]) || '').trim().replace(/^"|"$/g, '')); } catch (_) { return (utf8 && utf8[1] || plain && (plain[1] || plain[2]) || '').trim(); }
  };
  const filenameFromUrl = href => {
    try { return decodeURIComponent(new URL(href, location.href).pathname.split('/').filter(Boolean).pop() || '下載檔案'); } catch (_) { return '下載檔案'; }
  };
  const close = () => {
    const modal = document.getElementById('ipadDownloadModal');
    if (modal) modal.remove();
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    activeUrl = '';
  };
  const show = (name, blob) => {
    close();
    activeUrl = URL.createObjectURL(blob);
    const modal = document.createElement('div');
    modal.id = 'ipadDownloadModal';
    modal.innerHTML = `<div class="ipad-download-card" role="dialog" aria-modal="true" aria-label="儲存檔案"><b>檔案已準備好</b><span class="ipad-download-name"></span><span class="ipad-download-size"></span><div class="ipad-download-actions"><button type="button" class="btn primary ipad-download-save">儲存檔案</button><button type="button" class="btn ipad-download-close">關閉</button></div><p class="ipad-download-fallback" hidden></p></div>`;
    modal.querySelector('.ipad-download-name').textContent = name;
    modal.querySelector('.ipad-download-size').textContent = bytes(blob.size);
    const fallback = modal.querySelector('.ipad-download-fallback');
    const save = modal.querySelector('.ipad-download-save');
    modal.querySelector('.ipad-download-close').onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
    save.onclick = async () => {
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try { await navigator.share({ files: [file], title: name }); } catch (error) { if (error && error.name !== 'AbortError') fallback.textContent = `無法開啟儲存選單：${error.message || '請再試一次。'}`; }
        return;
      }
      const link = document.createElement('a');
      link.href = activeUrl; link.download = name; link.dataset.ipadDownloadFallback = '1'; link.textContent = '開啟檔案連結';
      fallback.hidden = false;
      fallback.replaceChildren('此裝置不支援分享檔案，請長按或點選：', link, '，再選擇儲存。');
    };
    document.body.appendChild(modal);
  };
  const showError = message => {
    const modal = document.getElementById('ipadDownloadModal');
    if (modal) modal.remove();
    const notice = document.createElement('div');
    notice.className = 'ipad-download-notice'; notice.setAttribute('role', 'alert');
    notice.textContent = `下載失敗：${message}`; document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 6000);
  };
  const prepare = async anchor => {
    const href = anchor.href;
    close();
    const notice = document.createElement('div');
    notice.className = 'ipad-download-notice'; notice.textContent = '正在準備檔案…'; document.body.appendChild(notice);
    try {
      const response = await fetch(href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`伺服器回應 ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('檔案內容是空的');
      const name = anchor.getAttribute('download') || filenameFromDisposition(response.headers.get('Content-Disposition')) || filenameFromUrl(href);
      show(name, blob);
    } catch (error) {
      showError(error && error.message ? error.message : '無法取得檔案，請確認網路後重試。');
    } finally { notice.remove(); }
  };
  const isDownloadAnchor = anchor => {
    if (!anchor || anchor.dataset.ipadDownloadFallback) return false;
    const raw = anchor.getAttribute('href') || '';
    return anchor.hasAttribute('download') || downloadPath.test(raw) || downloadFile.test(raw);
  };
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest && event.target.closest('a');
    if (!isDownloadAnchor(anchor)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    prepare(anchor);
  }, true);
  // 自建但尚未插入 document 的 a.click() 不會冒泡到上面的捕捉監聽；例如 CSV、ZIP、SheetJS。
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isDownloadAnchor(this)) { prepare(this); return; }
    return nativeAnchorClick.call(this);
  };
  const style = document.createElement('style');
  style.textContent = `.ipad-download-notice{position:fixed;z-index:2147483647;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);max-width:calc(100vw - 32px);padding:12px 16px;border-radius:10px;background:#423328;color:#fff;font:16px/1.45 system-ui,-apple-system,"Noto Sans TC",sans-serif;box-shadow:0 4px 18px #0005}.ipad-download-notice,#ipadDownloadModal{box-sizing:border-box}#ipadDownloadModal{position:fixed;z-index:2147483647;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:#0008;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}.ipad-download-card{box-sizing:border-box;width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:22px;border-radius:14px;background:#fffaf4;color:#423328;box-shadow:0 8px 30px #0006}.ipad-download-card b{display:block;font-size:20px}.ipad-download-name{display:block;margin-top:12px;overflow-wrap:anywhere;font-size:17px}.ipad-download-size{display:block;margin-top:5px;color:#75665b}.ipad-download-actions{display:grid;gap:10px;margin-top:20px}.ipad-download-actions .btn{min-height:48px;font-size:18px}.ipad-download-fallback{margin:14px 0 0;line-height:1.65;overflow-wrap:anywhere}.ipad-download-fallback a{color:#850103;text-decoration:underline}`;
  document.head.appendChild(style);
})();
