/* 系統公告：管理員在首頁最下方輸入公告，工讀生每次開任何分頁都會跳出。
   公告存雲端 syllabus_doc id=5：{msg, ts, pw}。此檔自帶 Supabase REST，任何分頁都可載入。 */
(function(){
  var U='https://esfepufqyeplafzbeeag.supabase.co/rest/v1/syllabus_doc';
  var K='sb_publishable_P_OpGwKYuWxpHMHCZdQRPA_1lCCLfNf';
  var DEFAULT_PW='0978200135';
  function hdr(){return {apikey:K,Authorization:'Bearer '+K};}
  function getAnn(){
    return fetch(U+'?select=content&id=eq.5',{headers:hdr()})
      .then(function(r){return r.json();})
      .then(function(j){
        if(j&&j[0]&&j[0].content){try{return JSON.parse(j[0].content);}catch(e){return {msg:String(j[0].content)};}}
        return null;
      }).catch(function(){return null;});
  }
  function saveAnn(obj){
    return fetch(U+'?on_conflict=id',{method:'POST',
      headers:Object.assign({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},hdr()),
      body:JSON.stringify([{id:5,content:JSON.stringify(obj)}])
    }).then(function(r){return r.ok;}).catch(function(){return false;});
  }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function showPopup(){
    getAnn().then(function(ann){
      if(!ann||!ann.msg||!String(ann.msg).trim())return;
      if(document.getElementById('qAnnPop'))return;
      var when=ann.ts?new Date(ann.ts).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
      var body=esc(ann.msg).replace(/\n/g,'<br>');
      var ov=document.createElement('div');
      ov.id='qAnnPop';
      ov.setAttribute('style','position:fixed;inset:0;z-index:2147483000;background:rgba(24,20,14,.55);display:flex;align-items:center;justify-content:center;padding:18px;font-family:"Noto Sans TC",system-ui,sans-serif');
      ov.innerHTML='<div style="background:#fffdf8;color:#2b2b2b;border-radius:16px;max-width:440px;width:100%;box-shadow:0 24px 64px -18px rgba(0,0,0,.55);overflow:hidden">'
        +'<div style="background:linear-gradient(135deg,#b8860b,#d8a72a);color:#fff;padding:15px 22px;font-size:17px;font-weight:800;letter-spacing:2px">📢 管理員公告</div>'
        +'<div style="padding:20px 22px 6px;font-size:15px;line-height:1.85;max-height:56vh;overflow:auto">'+body+'</div>'
        +(when?'<div style="padding:2px 22px 0;color:#a89f8c;font-size:12px">更新時間：'+esc(when)+'</div>':'')
        +'<div style="padding:16px 22px 20px;text-align:right"><button type="button" id="qAnnOk" style="background:#1f6f5c;color:#fff;border:0;border-radius:9px;padding:10px 24px;font-size:15px;font-weight:700;cursor:pointer">我知道了</button></div>'
        +'</div>';
      document.body.appendChild(ov);
      var ok=document.getElementById('qAnnOk');
      ok.focus();
      ok.onclick=function(){ov.remove();};
    });
  }
  // 首頁有登入鎖時，等解鎖後再跳公告
  function lockVisible(){var l=document.getElementById('lockScreen');return l&&getComputedStyle(l).display!=='none';}
  function tryShow(tries){
    if(lockVisible()){if((tries||0)<120)setTimeout(function(){tryShow((tries||0)+1);},1000);return;}
    showPopup();
  }
  window.QAnnounce={get:getAnn,save:saveAnn,DEFAULT_PW:DEFAULT_PW};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){tryShow(0);});
  else setTimeout(function(){tryShow(0);},0);
})();
