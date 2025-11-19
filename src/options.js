
const $ = (s) => document.querySelector(s);

// Transliteration & matching utilities
const RU_TO_LAT = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
function ruToLat(s){ return String(s||'').toLowerCase().replace(/[\u0400-\u04FF]/g, ch => RU_TO_LAT[ch] ?? ch); }
const TLD_STOP = new Set(['www','com','ru','net','org','info','io','co','app','dev','site','online','top','xyz']);
function tokenize(q){
  const raw = String(q||'').toLowerCase().split(/[^\p{L}\p{N}-]+/u).map(t=>t.trim()).filter(Boolean);
  const out = new Set();
  for (const t of raw){ if (t.length>=2 && !TLD_STOP.has(t)) out.add(t); const tl = ruToLat(t); if (tl!==t && tl.length>=2 && !TLD_STOP.has(tl)) out.add(tl); }
  return Array.from(out);
}
function sld(dom){ const d = String(dom||'').toLowerCase().replace(/^www\./,''); return (d.split('.')[0]||d); }
function matchesBrand(tokens, dom, alts){
  const d = String(dom||'').toLowerCase(); const dSLD = sld(d);
  const pool = [d, dSLD].concat((Array.isArray(alts)?alts:[]).map(a=>String(a).toLowerCase())).concat((Array.isArray(alts)?alts:[]).map(a=>sld(a)));
  for (const token of tokens){
    for (const cand of pool){
      if (!token || !cand) continue;
      if (cand.includes(token) || token.includes(cand)) return true;
      const candTL = ruToLat(cand);
      if (candTL.includes(token) || token.includes(candTL)) return true;
    }
  }
  return false;
}

// Storage helpers
function normalizeKeyDomain(s){
  const t = String(s||'').trim();
  try { const u = new URL(t); return u.hostname.replace(/^www\./i,'').toLowerCase(); } catch(_){}
  return t.replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/.*$/,'').toLowerCase();
}
function normalizeAlt(s){
  const t = String(s||'').trim();
  try { const u = new URL(t); if(!/^https?:$/i.test(u.protocol)) throw 0; return u.href; } catch(_){}

function toHrefLocal(input){
  const t = String(input||'').trim();
  if(!t) return { href:'', host:'' };
  try {
    const u = new URL(t);
    if(!/^https?:$/i.test(u.protocol)) throw 0;
    return { href:u.href, host:u.hostname.replace(/^www\./i,'').toLowerCase() };
  } catch(_){}
  const clean = t.replace(/^https?:\/\//i,''); // preserve path if present
  const host = clean.replace(/^www\./i,'').split('/')[0].toLowerCase();
  return { href:`https://${clean}`, host };
}
  const host = t.replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/.*$/,'').toLowerCase();
  return host || '';
}
function getMap(){ return new Promise(r => chrome.storage.sync.get({ alternates: {} }, d => r(d.alternates || {}))); }
function saveMap(map){ return new Promise(r => chrome.storage.sync.set({ alternates: map }, r)); }

// Rendering
function render(map){
  const list = $('#list'); list.innerHTML='';
  const entries = Object.entries(map).sort(([a],[b])=>a.localeCompare(b));
  for (const [dom, alts] of entries){
    const wrap = document.createElement('div'); wrap.className='item';
    const left = document.createElement('div'); left.className='domain'; left.textContent = dom;
    const mid = document.createElement('div'); mid.className='alts';
    (Array.isArray(alts)?alts:[]).forEach(a => {
      const clean = String(a).replace(/^https?:\/\//,'');
      const link = document.createElement('a');
      link.href = `https://${clean}`; link.target='_blank'; link.rel='noreferrer'; link.className='pill';
      link.innerHTML = `${a} <span class="arrow">⭢</span>`;
      mid.appendChild(link);
    });
    const right = document.createElement('div');
    const del = document.createElement('button'); del.className='btn';
    del.textContent = chrome.i18n.getMessage('deleteBtn') || 'Delete';
    del.addEventListener('click', async ()=>{ const cur = await getMap(); delete cur[dom]; await saveMap(cur); CACHE=cur; applyFilterAndRender(); });
    right.appendChild(del);
    wrap.append(left, mid, right); list.appendChild(wrap);
  }
  if (!entries.length){ const empty=document.createElement('div'); empty.className='muted'; empty.textContent = chrome.i18n.getMessage('listEmpty') || 'List is empty.'; list.appendChild(empty); }
}

// Bookmarks fetch & render
let BM_CACHE = null;
function fetchBookmarks(){ return new Promise((res)=>{
  if (BM_CACHE) return res(BM_CACHE);
  try {
    chrome.bookmarks.getTree((nodes)=>{
      const flat=[];
      const walk=(arr)=>{ for(const x of (arr||[])){ if (x.url) flat.push({title: x.title||'', url: x.url}); if (x.children) walk(x.children);} };
      walk(nodes||[]);
      BM_CACHE = flat; res(flat);
    });
  } catch(e) {
    // Fallback via background message (for completeness)
    try { chrome.runtime.sendMessage({type:'ah:get-bookmarks'}, (resp)=>{ const list=(resp&&resp.ok&&Array.isArray(resp.items))?resp.items:[]; BM_CACHE=list; res(list);}); }
    catch(err){ res([]); }
  }
});}

function renderBookmarks(tokens){
  const sec = $('#bmSection'); const box = $('#bmResults');
  if (!sec || !box) return;
  fetchBookmarks().then(list => {
    box.innerHTML='';
    if (!tokens || !tokens.length){ sec.style.display='none'; return; }
    const hits=[]; const seen=new Set();
    const kw = new Set(tokens);
    const add = (v)=>{ const s=String(v||'').toLowerCase(); if(s){ kw.add(s); const t=ruToLat(s); if(t && t!==s) kw.add(t);} };
    // No alternates context here, sticks to tokens only
    for (const n of list){
      const url = n.url || ''; if (!/^https?:/i.test(url)) continue;
      const lcurl = url.replace(/^[a-z]+:\/\//i,'').toLowerCase();
      let ok=false; for(const k of kw){ if(k && lcurl.includes(k)){ ok=true; break; } }
      if(!ok) continue;
      const key = `${n.title}|${url}`; if (seen.has(key)) continue; seen.add(key);
      hits.push({ title: n.title || url, url });
      if (hits.length >= 10) break;
    }
    if (!hits.length){ sec.style.display='none'; return; }
    sec.style.display='';
    hits.forEach(h=>{
      const a=document.createElement('a'); a.className='pill'; a.href=h.url; a.target='_blank'; a.rel='noreferrer';
      const img=document.createElement('img'); img.src=`${(function(){try{return 'https://icons.duckduckgo.com/ip3/'+(new URL(h.url).hostname)+'.ico'}catch(e){return ''}})()}`; img.width=16; img.height=16; img.className='bookmark-favicon';
      const span=document.createElement('span'); const t=h.title && h.title.trim()?h.title.trim(): (new URL(h.url).hostname);
      span.textContent = t.length>28 ? t.slice(0,25)+'…' : t;
      const arrow=document.createElement('span'); arrow.textContent='⭢'; arrow.className='arrow';
      a.append(img, span, arrow); box.appendChild(a);
    });
  });
}

// Filter & bootstrap
let CACHE = {}; let TOKENS = [];
function applyFilterAndRender(){
  const q = ($('#search')?.value || '').trim();
  TOKENS = tokenize(q);
  if (!TOKENS.length){ render(CACHE); renderBookmarks([]); return; }
  const subset = {};
  for (const [dom, alts] of Object.entries(CACHE)){ if (matchesBrand(TOKENS, dom, alts)) subset[dom]=alts; }
  render(subset); renderBookmarks(TOKENS);
}

$('#add').addEventListener('click', async () => {
  const dom = normalizeKeyDomain($('#domain').value);
  const alts = ($('#alts').value || '').split(',').map(s => normalizeAlt(s)).filter(Boolean);
  if (!dom || !alts.length) return;
  const map = await getMap(); map[dom] = Array.from(new Set(alts));
  await saveMap(map); $('#domain').value=''; $('#alts').value=''; CACHE=map; applyFilterAndRender();
});
$('#exportBtn').addEventListener('click', async () => {
  const map = await getMap(); const blob=new Blob([JSON.stringify(map,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='alternates.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
$('#importBtn').addEventListener('click', async () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = async () => {
    try {
      const f = input.files[0]; if (!f) return;
      const text = await f.text();
      const obj = JSON.parse(text);
      const current = await getMap();
      const next = { ...current };

      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) {
          const key = normalizeKeyDomain(k); if (!key) continue;
          const arr = Array.isArray(v) ? v.map(s => normalizeAlt(s)).filter(Boolean) : [];
          if (!arr.length) continue;
          const prev = Array.isArray(next[key]) ? next[key] : [];
          next[key] = Array.from(new Set([...prev, ...arr]));
        }
      } else if (Array.isArray(obj)) {
        // accept [["example.com", ["alt1","https://..."]], ...] or [{domain, alternates}]
        for (const item of obj) {
          if (Array.isArray(item) && item.length>=2) {
            const key = normalizeKeyDomain(item[0]); if (!key) continue;
            const arr = Array.isArray(item[1]) ? item[1].map(s=>normalizeAlt(s)).filter(Boolean) : [];
            if (!arr.length) continue;
            const prev = Array.isArray(next[key]) ? next[key] : [];
            next[key] = Array.from(new Set([...prev, ...arr]));
          } else if (item && typeof item === 'object') {
            const key = normalizeKeyDomain(item.domain || item.key || ''); if (!key) continue;
            const arr = Array.isArray(item.alternates || item.values || item.alts) ? (item.alternates || item.values || item.alts).map(s=>normalizeAlt(s)).filter(Boolean) : [];
            if (!arr.length) continue;
            const prev = Array.isArray(next[key]) ? next[key] : [];
            next[key] = Array.from(new Set([...prev, ...arr]));
          }
        }
      }

      await saveMap(next);
      CACHE = next;
      applyFilterAndRender();
    } catch (e) { console.error('Import failed', e); }
  };
  input.click();
});


// --- Preferences ---
const PREF_DEFAULTS = { minToken: 2, showSerpBookmarks: true, showBadge: true, useUnicodeTokenize: true, panelMode: 'chip' };

function loadPrefs(){
  return new Promise(resolve => {
    chrome.storage.sync.get({ prefs: PREF_DEFAULTS }, data => resolve(data.prefs || PREF_DEFAULTS));
  });
}
function savePrefs(p){ return new Promise(r => chrome.storage.sync.set({ prefs: p }, r)); }

async function initPrefsUI(){
  const box = document.querySelector('#prefs'); if (!box) return;
  const panelRadios = Array.from(document.querySelectorAll('input[name="panelMode"]'));
  const els = {
    min: document.querySelector('#prefMinToken'),
    minVal: document.querySelector('#prefMinTokenVal'),
    unicode: document.querySelector('#prefUnicode'),
    showBm: document.querySelector('#prefShowBookmarks'),
    badge: document.querySelector('#prefShowBadge'),
    panelRadios,
  };
  const prefs = await loadPrefs();
  els.min.value = String(prefs.minToken ?? 2);
  els.minVal.textContent = String(prefs.minToken ?? 2);
  els.unicode.checked = !!prefs.useUnicodeTokenize;
  els.showBm.checked = !!prefs.showSerpBookmarks;
  els.badge.checked = !!prefs.showBadge;
  const modeVal = ['icon','chip','auto'].includes(prefs.panelMode) ? prefs.panelMode : 'chip';
  panelRadios.forEach(r => { r.checked = r.value === modeVal; });

  const debouncedSave = (() => {
    let t=null;
    return (next) => { clearTimeout(t); t=setTimeout(async () => { await savePrefs(next); }, 250); };
  })();

  function snapshot(){
    const selected = panelRadios.find(r => r.checked);
    const prefMode = selected ? selected.value : 'chip';
    return {
      minToken: parseInt(els.min.value,10) || 2,
      useUnicodeTokenize: !!els.unicode.checked,
      showSerpBookmarks: !!els.showBm.checked,
      showBadge: !!els.badge.checked,
      panelMode: ['icon','chip','auto'].includes(prefMode) ? prefMode : 'chip',
    };
  }
  els.min.addEventListener('input', () => { els.minVal.textContent = els.min.value; debouncedSave(snapshot()); });
  [els.unicode, els.showBm, els.badge].forEach(ch => ch.addEventListener('change', () => debouncedSave(snapshot())));
  panelRadios.forEach(r => r.addEventListener('change', () => debouncedSave(snapshot())));
}

(async function boot(){
  await initPrefsUI(); CACHE = await getMap(); const s=$('#search'); if(s) s.addEventListener('input', applyFilterAndRender); applyFilterAndRender(); })();
