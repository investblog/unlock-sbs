(function(){function t(id){try{return chrome.i18n.getMessage(id)||''}catch(e){return''}}document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');const v=t(k);if(v){if(el.tagName==='TITLE')el.textContent=v;else el.textContent=v;}});const map={'#add':'addBtn','#exportBtn':'exportBtn','#importBtn':'importBtn','#ah-load-bundle':'loadBundleBtn'};for(const [sel,key] of Object.entries(map)){const el=document.querySelector(sel);if(el)el.textContent=t(key)||el.textContent;}})();
;(()=>{
  const get=(k)=>{try{return chrome.i18n.getMessage(k)||''}catch(e){return''}};
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key=el.getAttribute('data-i18n-placeholder'); const v=get(key); if(v) el.setAttribute('placeholder', v);
  });
})();
