
(function () {
// Normalize an input (domain or full URL) to safe href + host label
function toHref(input){
  const t = String(input || '').trim();
  if (!t) return { href:'', host:'' };
  try {
    const u = new URL(t);
    if (!/^https?:$/i.test(u.protocol)) throw new Error('unsupported');
    return { href: u.href, host: u.hostname.replace(/^www\./i,'').toLowerCase() };
  } catch (_){}
  const clean = t.replace(/^https?:\/\//i,'').replace(/\/.*$/,'');
  const host = clean.replace(/^www\./i,'').toLowerCase();
  if (!host) return { href:'', host:'' };
  return { href: `https://${host}`, host };
}
function toHost(input){ return toHref(input).host; }

  function _(id, fallback=''){ try { return chrome.i18n.getMessage(id) || fallback; } catch(e){ return fallback; } }

  // --- host & query helpers ---
  function isSerpHost(){
    const h = location.host;
    return h.startsWith('www.google.') || h === 'www.bing.com' || h === 'duckduckgo.com' || /^yandex\./i.test(h) || /(^|\.)ya\.ru$/i.test(h);
  }
  function getQuery() {
    const u = new URL(location.href);
    const host = location.host;
    if (host.startsWith('www.google.')) return u.searchParams.get('q') || '';
    if (host === 'www.bing.com') return u.searchParams.get('q') || '';
    if (host === 'duckduckgo.com') return u.searchParams.get('q') || '';
    if (/^yandex\./i.test(host) || /(^|\.)ya\.ru$/i.test(host)) return u.searchParams.get('text') || '';
    return '';
  }
  function getQueryFromDom(){
    try {
      const sels = ["input[name='q']","input[name='text']","form[role='search'] input","#text"];
      for (const sel of sels){ const el = document.querySelector(sel); if (el && el.value) return el.value; }
    } catch(e) {}
    return '';
  }
  function findDomainsInQuery(q) {
    const out = new Set();
    const rx = /([a-z0-9-]+\.[a-z.]{2,})/gi;
    let m; while ((m = rx.exec(q)) !== null) out.add(m[1].replace(/^www\./i,''));
    return Array.from(out);
  }

  // --- prefs & helpers ---
  const DEFAULT_PREFS = { minToken: 2, showSerpBookmarks: true, showBadge: true, useUnicodeTokenize: true, panelMode: 'chip' };
  const TLD_STOP = new Set(['www','com','ru','net','org','info','io','co','app','dev','site','online','top','xyz']);
  const RU_TO_LAT = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  function ruToLat(s){ return String(s||'').toLowerCase().replace(/[\u0400-\u04FF]/g, ch => RU_TO_LAT[ch] ?? ch); }

  let __prefs = DEFAULT_PREFS;
  const BRAND_ICON_URL = (()=>{ try { return chrome.runtime.getURL('icons/brand.svg'); } catch(e){ return ''; } })();
  const PANEL_STYLE_ID = 'ah-serp-style';

  function normalizePanelMode(mode){
    if (mode === 'icon' || mode === 'auto') return mode;
    return 'chip';
  }

  function ensurePanelStyles(){
    if (document.getElementById(PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_STYLE_ID;
    style.textContent = `
      #ah-serp { position: fixed; top: 16px; right: 16px; z-index: 2147483647; font-family: Roboto, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color:#e7ecf3; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
      #ah-serp * { box-sizing: border-box; font-family: inherit; }
      #ah-serp .ah-chip { display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:999px; border:1px solid #223052; background:#121a2b; color:#e7ecf3; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.25); font-weight:600; font-size:13px; }
      #ah-serp .ah-chip:focus-visible { outline:2px solid #4c8dff; outline-offset:2px; }
      #ah-serp .ah-chip-icon { width:18px; height:18px; display:inline-flex; color:#e7ecf3; }
      #ah-serp .ah-chip-icon img { width:100%; height:100%; display:block; }
      #ah-serp .ah-panel { background:#121a2b; color:#e7ecf3; border:1px solid #223052; border-radius:12px; padding:12px 14px; box-shadow:0 6px 20px rgba(0,0,0,.25); width: min(560px, calc(100vw - 32px)); }
      #ah-serp .ah-panel-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px; }
      #ah-serp .ah-panel-title { font-weight:600; font-size:14px; }
      #ah-serp .ah-panel-close { width:28px; height:28px; border:1px solid #2b3a5f; background:#1a2440; color:#e7ecf3; border-radius:6px; cursor:pointer; font-size:16px; line-height:26px; padding:0; }
      #ah-serp .ah-panel-body { font-size:13px; line-height:1.5; }
      #ah-serp .ah-panel-actions { margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; }
      #ah-serp .ah-panel-actions button { font-size:12px; padding:6px 10px; background:#1a2440; color:#e7ecf3; border:1px solid #2b3a5f; border-radius:8px; cursor:pointer; }
      #ah-serp .ah-section { display:none; margin:6px 0 4px; }
      #ah-serp .ah-section.active { display:block; }
      #ah-serp .ah-pill-row { display:flex; flex-wrap:wrap; gap:8px; }
      #ah-serp.ah-serp-expanded .ah-panel { display:block; }
      #ah-serp.ah-serp-expanded .ah-chip { display:none; }
      #ah-serp:not(.ah-serp-expanded) .ah-panel { display:none; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setPanelExpanded(el, expanded){ if (!el) return; if (expanded) el.classList.add('ah-serp-expanded'); else el.classList.remove('ah-serp-expanded'); }
  function collapsePanel(el){ setPanelExpanded(el, false); }
  function expandPanel(el){ setPanelExpanded(el, true); }
  function updateChipCount(el, count){ if (!el) return; const target = el.querySelector('#ah-chip-count'); if (target) target.textContent = String(Math.max(0, parseInt(count,10)||0)); }
  function setBadgeCount(count){
    try {
      if (!__prefs || __prefs.showBadge !== false) {
        chrome.runtime.sendMessage({ type: 'ah:set-badge', count: Math.max(0, parseInt(count, 10) || 0) });
      }
    } catch(e){}
  }

  function tokenizeQuery(q){
    const str = String(q || '').toLowerCase();
    let splitter = null;
    // try to build Unicode-aware splitter dynamically; if not supported, fallback
    if (__prefs && __prefs.useUnicodeTokenize) {
      try { splitter = new RegExp('[^\\p{L}\\p{N}-]+','u'); } catch(e) { splitter = null; }
    }
    if (!splitter) splitter = /[^a-z0-9\u0400-\u04FF-]+/i;
    const raw = str.split(splitter).map(t => t.trim()).filter(Boolean);
    const out = new Set();
    const minTok = Math.max(1, parseInt((__prefs && __prefs.minToken) || 2, 10));
    for (const t of raw) {
      if (t.length >= minTok && !TLD_STOP.has(t)) out.add(t);
      const tl = ruToLat(t);
      if (tl && tl !== t && tl.length >= minTok && !TLD_STOP.has(tl)) out.add(tl);
    }
    return Array.from(out);
  }

  function matchAlternatesByBrandTokens(tokens, map){
    const seen = new Set(); const scored = [];
    for (const dom of Object.keys(map || {})) {
      const d = String(dom || '').toLowerCase().replace(/^www\./,'');
      const sld = (d.split('.')[0] || d);
      let score = 0;
      for (const t of tokens) {
        if (!t) continue;
        if (t === sld) score = Math.max(score, 3);
        else if (sld.includes(t)) score = Math.max(score, 2);
        else if (t.includes(sld)) score = Math.max(score, 1);
      }
      if (score > 0 && !seen.has(d)) { seen.add(d); scored.push({ key: d, score }); }
    }
    scored.sort((a,b)=> b.score - a.score || a.key.length - b.key.length);
    return scored.map(x=>x.key).slice(0, 8);
  }

  // --- UI helpers ---
  function injectPanel() {
    ensurePanelStyles();
    let el = document.getElementById('ah-serp');
    if (el) return el;
    const box = document.createElement('div');
    const chipLabel = _('chipLabel', 'Unlock.SBS');
    box.innerHTML = `
      <div id="ah-serp">
        <button id="ah-chip" class="ah-chip" type="button" aria-label="${_('serpPanelTitle','Search tips')}">
          <span class="ah-chip-icon">${BRAND_ICON_URL ? `<img src="${BRAND_ICON_URL}" alt="" />` : ''}</span>
          <span class="ah-chip-text">${chipLabel} · <span id="ah-chip-count">0</span></span>
        </button>
        <div class="ah-panel">
          <div class="ah-panel-header">
            <div class="ah-panel-title">${_('serpPanelTitle','Search tips')}</div>
            <button id="ah-close-x" class="ah-panel-close" type="button" aria-label="${_('serpHide','Hide')}">×</button>
          </div>
          <div id="ah-mirrors" class="ah-section"></div>
          <div id="ah-bookmarks" class="ah-section"></div>
          <div id="ah-body" class="ah-panel-body"></div>
          <div id="ah-actions" class="ah-panel-actions">
            <button id="ah-settings" type="button">${_('settingsBtn','Settings')}</button>
            <button id="ah-close" type="button">${_('serpHide','Hide')}</button>
          </div>
        </div>
      </div>`;
    el = box.firstElementChild;
    document.documentElement.appendChild(el);
    const chip = el.querySelector('#ah-chip'); if (chip) chip.addEventListener('click', () => expandPanel(el));
    const collapse = () => collapsePanel(el);
    const cx = el.querySelector('#ah-close-x'); if (cx) cx.addEventListener('click', collapse);
    const closeBtn = el.querySelector('#ah-close'); if (closeBtn) closeBtn.addEventListener('click', collapse);
    const sb = el.querySelector('#ah-settings');
    if (sb) sb.addEventListener('click', ()=>{ try{ chrome.runtime.sendMessage({type:'ah:open-settings'}); }catch(e){} });
    return el;
  }
  function makePlainLink(href, text) { return `<a href="${href}" target="_blank" rel="noreferrer" style="color:#a8c6ff; text-decoration:underline; cursor:pointer">${text}</a>`; }
  function makePillLink(href, text) {
    return `<a href="${href}" target="_blank" rel="noreferrer" style="color:#a8c6ff; text-decoration:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #2b3a5f; border-radius:999px; background:#1a2440">${text}<span style="opacity:.9">⭢</span></a>`;
  }

  // bookmarks via background
  let __bmCache = null;
  function fetchBookmarksOnce(){
    return new Promise((resolve)=>{
      if (__bmCache) return resolve(__bmCache);
      try {
        chrome.runtime.sendMessage({type:'ah:get-bookmarks'}, (resp)=>{
          const list = (resp && resp.ok && Array.isArray(resp.items)) ? resp.items : [];
          __bmCache = list; resolve(list);
        });
      } catch(e){ resolve([]); }
    });
  }

  // --- main render ---
  let lastUrl = location.href;
  function renderTips() {
    if (!isSerpHost()) return;
    lastUrl = location.href;
    chrome.storage.sync.get({ alternates: {}, prefs: DEFAULT_PREFS }, (data) => {
      __prefs = data.prefs || DEFAULT_PREFS;
      let q = getQuery(); if (!q) q = getQueryFromDom();
      const map = data.alternates || {};
      const tokens = tokenizeQuery(q);
      let matchedKeys = matchAlternatesByBrandTokens(tokens, map);
      const domainTokens = findDomainsInQuery(q).map(s => s.toLowerCase());
      for (const d of domainTokens){ if (map[d] && !matchedKeys.includes(d)) matchedKeys.push(d); }

      const existing = document.getElementById('ah-serp');
      if (!matchedKeys.length) { setBadgeCount(0); if (existing) existing.remove(); return; }

      const panelMode = normalizePanelMode((__prefs && __prefs.panelMode) || 'chip');
      const shouldRenderPanel = panelMode !== 'icon';
      let el = null;
      let body = null;
      let mirrorsWrap = null;
      let bmWrap = null;
      if (shouldRenderPanel) {
        el = injectPanel();
        setPanelExpanded(el, panelMode === 'auto');
        body = el.querySelector('#ah-body');
        mirrorsWrap = el.querySelector('#ah-mirrors'); if (mirrorsWrap) { mirrorsWrap.innerHTML=''; mirrorsWrap.classList.remove('active'); }
        bmWrap = el.querySelector('#ah-bookmarks'); if (bmWrap) { bmWrap.innerHTML=''; bmWrap.classList.remove('active'); }
      } else if (existing) {
        existing.remove();
      }

      let tipCount = matchedKeys.length;
      setBadgeCount(tipCount);
      if (shouldRenderPanel && el) updateChipCount(el, tipCount);

      if (shouldRenderPanel && mirrorsWrap) {
        let showedMirrors = false;
        matchedKeys.forEach((key) => {
          const alts = (map[key] || map[key.replace(/^www\./,'')]) || [];
          if (Array.isArray(alts) && alts.length) {
            if (!showedMirrors) {
              showedMirrors = true;
              mirrorsWrap.classList.add('active');
              const label = document.createElement('div');
              label.style.cssText='font-size:13px; color:#a9b4c7; margin-bottom:6px;';
              label.textContent = `${_('serpTipAlternates','Official alternates from your settings:')} ${key}:`;
              mirrorsWrap.appendChild(label);
            }
            const row = document.createElement('div');
            row.className = 'ah-pill-row';
            alts.forEach(a => {
              const obj = toHref(a);
              const pill = document.createElement('span');
              pill.innerHTML = makePillLink(obj.href, obj.host);
              const anchor = pill.firstChild; if (anchor && anchor.tagName==='A') anchor.title = obj.href; row.appendChild(anchor);
            });
            mirrorsWrap.appendChild(row);
          }
        });
      }

      if (!__prefs || __prefs.showSerpBookmarks !== false) {
        fetchBookmarksOnce().then(list => {
          try {
            const kw = new Set(tokens);
            const addKw = (s)=>{ const v=String(s||'').toLowerCase(); if(v && !TLD_STOP.has(v)) { kw.add(v); const t=ruToLat(v); if(t && t!==v && !TLD_STOP.has(t)) kw.add(t); if (v.includes('.')) { const sld=v.replace(/^www\\./,'').split('.')[0]; if(sld && !TLD_STOP.has(sld)) { kw.add(sld); const ts=ruToLat(sld); if(ts && ts!==sld && !TLD_STOP.has(ts)) kw.add(ts);} } } };
            const slds = new Set();
            matchedKeys.forEach((key) => {
              addKw(key); slds.add((key.split('.')[0]||key).toLowerCase());
              const alts = (map[key] || map[key.replace(/^www\./,'')]) || [];
              alts.forEach(a => { const d=toHost(a); addKw(d); slds.add((d.split('.')[0]||d)); });
            });
            slds.forEach(addKw);

            const bookmarkHits = [];
            const seen = new Set();
            for (const n of list) {
              const url = n.url || '';
              if (!/^https?:/i.test(url)) continue;
              const lcurl = url.replace(/^[a-z]+:\/\/?/i,'').toLowerCase();
              let ok = false; for (const k of kw){ if (k && lcurl.includes(k)) { ok=true; break; } }
              if (!ok) continue;
              const key = `${n.title}|${url}`; if (seen.has(key)) continue; seen.add(key);
              bookmarkHits.push({ title: n.title || url, url });
              if (bookmarkHits.length >= 6) break;
            }

            tipCount = matchedKeys.length + bookmarkHits.length;
            setBadgeCount(tipCount);
            if (shouldRenderPanel && el) updateChipCount(el, tipCount);

            if (bookmarkHits.length && shouldRenderPanel && bmWrap) {
              bmWrap.classList.add('active');
              const label = document.createElement('div');
              label.style.cssText='font-size:13px; color:#a9b4c7; margin-bottom:6px;';
              label.textContent = _(`bookmarksHeading`,`Related bookmarks`);
              bmWrap.appendChild(label);
              const row = document.createElement('div');
              row.className = 'ah-pill-row';
              bookmarkHits.forEach(h => {
                const a = document.createElement('a');
                a.href = h.url; a.target='_blank'; a.rel='noreferrer'; a.title = h.url;
                a.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #2b3a5f;border-radius:999px;background:#1a2440;color:#a8c6ff;text-decoration:none;cursor:pointer;max-width:260px;font-size:12px;';
                const img = document.createElement('img'); let host=''; try{ host=new URL(h.url).hostname; }catch{}; img.src=`https://icons.duckduckgo.com/ip3/${host}.ico`; img.width=16; img.height=16; img.style.cssText='border-radius:3px; flex:0 0 auto;';
                const span = document.createElement('span'); const t = h.title && h.title.trim() ? h.title.trim() : (new URL(h.url).hostname);
                span.textContent = t.length>28 ? t.slice(0,25)+'…' : t;
                const arrow = document.createElement('span'); arrow.textContent='⭢'; arrow.style.opacity='.9';
                a.append(img, span, arrow); row.appendChild(a);
              });
              bmWrap.appendChild(row);
            }
          } catch(e) { /* ignore */ }
        });
      }

      if (shouldRenderPanel && body) {
        const tips = [];
        tips.push(_(`serpTipCheck`, 'Check spelling, try a more precise phrase, or use quotes for exact match.'));
        const host = location.host;
        const isYandex = /^yandex\./i.test(host) || /(^|\.)ya\.ru$/i.test(host);
        if (!isYandex && domainTokens.length) {
          const d = domainTokens[0];
          const hasSiteOrHost = /\b(?:site|host):\S+/i.test(q);
          if (!hasSiteOrHost) {
            const cleanedOnce = q.replace(/\b(?:site|host):\S+/gi, ' ').trim();
            const escapedD = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const cleaned = cleanedOnce.replace(new RegExp(escapedD, 'gi'), ' ').replace(/\s{2,}/g, ' ').trim();
            const newQ = cleaned ? `site:${d} ${cleaned}` : `site:${d}`;
            tips.push(`${_('serpTipRestrict','Try restricting the search to domain:')} <span>${makePlainLink(`https://www.google.com/search?q=${encodeURIComponent(newQ)}`, `site:${d}`)}</span>.`);
          }
        }
        tips.push(`${_('serpTipArchive','See archived copies:')} ${makePlainLink('https://web.archive.org/', 'Wayback Machine')}.`);
        body.innerHTML = tips.map(t => `<div style="margin:4px 0">${t}</div>`).join('');
      }
    });
  }

  renderTips();
  function onUrlMaybeChanged(){ if (location.href !== lastUrl) { const el = document.getElementById('ah-serp'); if (el) el.remove(); renderTips(); } }
  const _push = history.pushState; history.pushState = function(){ _push.apply(this, arguments); setTimeout(onUrlMaybeChanged, 0); };
  const _replace = history.replaceState; history.replaceState = function(){ _replace.apply(this, arguments); setTimeout(onUrlMaybeChanged, 0); };
  window.addEventListener('popstate', onUrlMaybeChanged);
  setInterval(onUrlMaybeChanged, 800);
})();
