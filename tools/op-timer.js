// 前處理頁：顯示並記錄 OCR、自動切圖的耗時。紀錄只存在這個瀏覽器（localStorage），不會上傳。
(function () {
  const KEY = 'opTimerLog', MAX = 50;
  const OPS = [
    { fn: 'autoCropByModel', label: '自動切圖', statusId: 'cropReviewState', file: () => { try { return cropFiles.pdf; } catch (e) { return null; } } },
    { fn: 'runAutoOcr', label: 'OCR', statusId: 'ocrStatus', file: args => args[0] },
  ];
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = rows => { try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX))); } catch (e) {} };
  const fmt = s => s < 60 ? s + ' 秒' : Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hostName = () => { try { return localStorage.getItem('ocrHost') === 'local' ? '本機' : '公司電腦'; } catch (e) { return ''; } };

  function ui(op) {
    const status = document.getElementById(op.statusId);
    if (!status) return null;
    let box = document.getElementById('opTimer-' + op.fn);
    if (!box) {
      box = document.createElement('div');
      box.id = 'opTimer-' + op.fn;
      box.style.cssText = 'margin:8px 0;font-size:14px;color:#7a5c2e';
      box.innerHTML = '<div data-now style="font-weight:600"></div><details style="margin-top:4px"><summary style="cursor:pointer">⏱ 時間紀錄</summary><div data-log style="overflow-x:auto"></div></details>';
      status.insertAdjacentElement('afterend', box);
    }
    return box;
  }

  function renderLog(op) {
    const box = ui(op);
    if (!box) return;
    const rows = load().filter(r => r.op === op.label);
    const ok = rows.filter(r => r.ok);
    const avg = ok.length ? Math.round(ok.reduce((a, r) => a + r.sec, 0) / ok.length) : null;
    box.querySelector('[data-log]').innerHTML = !rows.length ? '<p style="margin:6px 0">還沒有紀錄。</p>' :
      '<p style="margin:6px 0">' + (avg === null ? '還沒有成功紀錄' : '成功 ' + ok.length + ' 次，平均 ' + fmt(avg)) + '（只存在這個瀏覽器）</p>' +
      '<table style="border-collapse:collapse;font-size:13px;white-space:nowrap"><tr><th align="left">時間</th><th align="left">檔案</th><th align="left">主機</th><th align="right">耗時</th><th align="left">結果</th></tr>' +
      rows.slice(0, 15).map(r => '<tr><td style="padding:2px 10px 2px 0">' + esc(r.at) + '</td><td style="padding:2px 10px 2px 0;max-width:220px;overflow:hidden;text-overflow:ellipsis">' + esc(r.file) + '</td><td style="padding:2px 10px 2px 0">' + esc(r.host) + '</td><td align="right" style="padding:2px 10px 2px 0">' + fmt(r.sec) + '</td><td>' + (r.ok ? '成功' : '失敗') + '</td></tr>').join('') + '</table>';
  }

  OPS.forEach(op => {
    const original = window[op.fn];
    if (typeof original !== 'function') return;
    renderLog(op);
    window[op.fn] = async function (...args) {
      const file = op.file(args);
      if (!file) return original.apply(this, args);   // 沒選檔案：原函式會自己提示，不算一次
      const box = ui(op), now = box && box.querySelector('[data-now]'), started = Date.now();
      const secs = () => Math.round((Date.now() - started) / 1000);
      const tick = () => { if (now) now.textContent = '⏱ ' + op.label + '進行中：' + fmt(secs()); };
      tick();
      const timer = setInterval(tick, 1000);
      let threw = false;
      try {
        return await original.apply(this, args);
      } catch (e) {
        threw = true;
        throw e;
      } finally {
        clearInterval(timer);
        const sec = secs();
        const statusEl = document.getElementById(op.statusId);
        const ok = !threw && !/失敗|連不到|找不到/.test(statusEl ? statusEl.textContent : '');
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        save([{ op: op.label, at: pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()), file: file.name || '', host: hostName(), sec, ok }, ...load()]);
        if (now) now.textContent = '⏱ ' + op.label + (ok ? '完成' : '失敗') + '，耗時 ' + fmt(sec);
        renderLog(op);
      }
    };
  });
})();
