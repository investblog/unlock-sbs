
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

  function hasRuntime(){
    try {
      return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

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
  const STORAGE_DEFAULTS = { alternates: {}, prefs: DEFAULT_PREFS };

  function getPrefsAndAlternates(callback){
    const fallback = { alternates: {}, prefs: DEFAULT_PREFS };
    try {
      if (!hasRuntime() || !chrome.storage || !chrome.storage.sync) throw new Error('no storage');
      chrome.storage.sync.get(STORAGE_DEFAULTS, (data) => {
        try {
          const payload = data && typeof data === 'object' ? data : fallback;
          callback({
            alternates: payload.alternates || {},
            prefs: payload.prefs || DEFAULT_PREFS
          });
        } catch(_){}
      });
    } catch(_) {
      try { callback(fallback); } catch(__){}
    }
  }
  function createIcon(type = 'brand', size = 'md', tone = 'main') {
    const span = document.createElement('span');
    span.className = `ah-icon ah-icon--${size} ah-icon--${tone}`;
    span.setAttribute('aria-hidden', 'true');

    const img = document.createElement('img');
    img.alt = '';
    try {
      img.src = chrome.runtime.getURL(`icons/${type}.svg`);
    } catch (_) {
      img.src = `icons/${type}.svg`;
    }

    span.appendChild(img);
    return span;
  }
  function createSectionHeader(iconType, labelText, size = 'sm', tone = 'muted') {
    const div = document.createElement('div');
    div.className = 'ah-header';
    div.append(createIcon(iconType, size, tone), document.createElement('span'));
    div.lastElementChild.textContent = labelText;
    return div;
  }

  const PANEL_STYLE_ID = 'ah-serp-style';
  const TOAST_ID = 'ah-serp-toast';
  let __serpDismissed = false;

  function normalizePanelMode(mode){
    if (mode === 'icon' || mode === 'auto') return mode;
    return 'chip';
  }

  function ensurePanelStyles(){
    if (document.getElementById(PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_STYLE_ID;
    style.textContent = `
      :root {
        --ah-bg: #050812;
        --ah-bg-gradient: radial-gradient(circle at top left, #111827 0, #050812 50%);
        --ah-card: #0b1020;
        --ah-card-soft: #101625;
        --ah-border-subtle: rgba(255,255,255,.04);
        --ah-border-strong: #252c3c;
        --ah-text: #E7E9F0;
        --ah-muted: #9BA3B4;
        --ah-accent: #5E8BFF;
        --ah-accent-soft: rgba(94,139,255,.16);
        --ah-radius: 12px;
        --ah-radius-pill: 999px;
        --ah-shadow-soft: 0 18px 45px rgba(0,0,0,.55);
        --ah-font: system-ui, -apple-system, "Segoe UI", sans-serif;
        --ah-font-size: 13px;
      }
      #ah-serp {
        position: fixed;
        top: 64px;
        right: 86px;
        z-index: 999999;
        font-family: var(--ah-font);
        font-size: var(--ah-font-size);
        color: var(--ah-text);
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        min-width: 0;
      }
      #ah-serp * {
        box-sizing: border-box;
        font-family: inherit;
      }
      #ah-serp button {
        background: none;
        border: none;
        padding: 0;
        color: inherit;
        font: inherit;
      }
      #ah-serp .ah-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: var(--ah-radius-pill);
        border: 1px solid transparent;
        cursor: pointer;
        font-weight: 600;
        transition: border-color .15s ease, color .15s ease, background .15s ease, filter .15s ease;
      }
      #ah-serp .ah-btn:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-serp .ah-btn-outline {
        background: transparent;
        border-color: var(--ah-border-strong);
        color: var(--ah-text);
      }
      #ah-serp .ah-btn-outline:hover {
        color: var(--ah-accent);
        border-color: var(--ah-accent);
        background: var(--ah-accent-soft);
      }
      #ah-serp .ah-btn-ghost {
        background: rgba(255,255,255,.03);
        border-color: var(--ah-border-subtle);
        color: var(--ah-muted);
      }
      #ah-serp .ah-btn-ghost:hover { color: var(--ah-text); border-color: rgba(94,139,255,.4); }
      #ah-serp .ah-icon {
        display: inline-flex;
        width: 16px;
        height: 16px;
        vertical-align: middle;
      }
      #ah-serp .ah-icon img,
      #ah-serp .ah-icon svg {
        width: 100%;
        height: 100%;
        display: block;
        fill: currentColor;
      }
      #ah-serp .ah-icon--sm { width: 14px; height: 14px; }
      #ah-serp .ah-icon--lg { width: 20px; height: 20px; }
      #ah-serp .ah-icon--main  { color: var(--ah-accent); }
      #ah-serp .ah-icon--ok    { color: #25D0A4; }
      #ah-serp .ah-icon--warn  { color: #FF6B6B; }
      #ah-serp .ah-icon--muted { color: var(--ah-muted); }
      #ah-serp .ah-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 9px;
        border-radius: var(--ah-radius-pill);
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(10, 14, 24, .9);
        cursor: pointer;
        backdrop-filter: blur(8px);
        color: var(--ah-text);
        font-weight: 600;
      }
      #ah-serp .ah-chip:hover {
        border-color: rgba(94, 139, 255, .6);
        background: rgba(15, 20, 33, .95);
      }
      #ah-serp .ah-chip:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-serp .ah-chip-text {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #ah-serp .ah-chip-count {
        min-width: 20px;
        padding: 2px 6px;
        border-radius: var(--ah-radius-pill);
        font-size: 11px;
        line-height: 1;
        background: var(--ah-accent-soft);
        color: #c4d4ff;
      }
      #ah-serp .ah-dismiss {
        margin-bottom: 6px;
        align-self: flex-end;
        width: 24px;
        height: 24px;
      }
      #ah-serp .ah-serp-card {
        margin-top: 8px;
        background: var(--ah-card);
        border-radius: var(--ah-radius);
        border: 1px solid var(--ah-border-subtle);
        box-shadow: var(--ah-shadow-soft);
        padding: 14px 18px;
        max-width: 90vw;
        width: 360px;
      }
      #ah-serp .ah-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      #ah-serp .ah-panel-close {
        width: 28px;
        height: 28px;
        border-radius: var(--ah-radius);
      }
      #ah-serp .ah-panel-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--ah-text);
      }
      #ah-serp .ah-section {
        display: none;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--ah-border-subtle);
      }
      #ah-serp .ah-section.active { display: block; }
      #ah-serp .ah-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--ah-muted);
      }
      #ah-serp .ah-pill-row { display: flex; flex-wrap: wrap; gap: 10px; }
      #ah-serp .ah-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: var(--ah-radius-pill);
        border: 1px solid var(--ah-border-subtle);
        background: rgba(255,255,255,.02);
        color: var(--ah-text);
        text-decoration: none;
        font-size: 12px;
        transition: border-color .15s ease, color .15s ease, background .15s ease;
      }
      #ah-serp .ah-pill:hover { border-color: rgba(94,139,255,.8); color: #dbe4ff; }
      #ah-serp .ah-pill-rich { background: rgba(255,255,255,.04); }
      #ah-serp .ah-pill-label {
        display: inline-flex;
        align-items: center;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #ah-serp .ah-pill-arrow { color: var(--ah-muted); font-size: 12px; }
      #ah-serp .ah-pill-icon {
        border-radius: calc(var(--ah-radius) / 2);
        width: 16px;
        height: 16px;
        object-fit: cover;
      }
      #ah-serp .ah-section-note { margin: 0 0 6px; color: var(--ah-muted); }
      #ah-serp .ah-panel-body { font-size: var(--ah-font-size); color: var(--ah-text); }
      #ah-serp .ah-tip { margin: 4px 0; }
      #ah-serp .ah-inline-link { color: var(--ah-accent); text-decoration: none; }
      #ah-serp .ah-inline-link:hover { text-decoration: underline; }
      #ah-serp .ah-panel-actions {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--ah-border-subtle);
        display: flex;
        flex-wrap: nowrap;
        gap: 8px;
        justify-content: space-between;
        align-items: center;
      }
      #ah-serp.ah-serp-expanded .ah-chip { display: none; }
      #ah-serp:not(.ah-serp-expanded) .ah-serp-card { display: none; }
      #ah-serp-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 999999;
        background: var(--ah-card);
        color: var(--ah-text);
        border: 1px solid var(--ah-border-strong);
        border-radius: var(--ah-radius);
        padding: 8px 12px;
        box-shadow: var(--ah-shadow-soft);
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity .16s ease, transform .16s ease;
        pointer-events: none;
        font-family: var(--ah-font);
        font-size: var(--ah-font-size);
      }
      #ah-serp-toast.visible { opacity: 1; transform: translateY(0); }
    `;

    (document.head || document.documentElement).appendChild(style);
  }
  function showToast(message){
    if (!message) return;
    ensurePanelStyles();
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2400);
  }
  function showNoTipsToast(){
    showToast(_('serpNoTips','No tips right now'));
  }

  function setPanelExpanded(el, expanded){ if (!el) return; if (expanded) el.classList.add('ah-serp-expanded'); else el.classList.remove('ah-serp-expanded'); }
  function collapsePanel(el){ setPanelExpanded(el, false); }
  function expandPanel(el){ setPanelExpanded(el, true); }
  function updateChipCount(el, count){ if (!el) return; const target = el.querySelector('#ah-chip-count'); if (target) target.textContent = String(Math.max(0, parseInt(count,10)||0)); }
  function setBadgeCount(count){
      try {
        if (!__prefs || __prefs.showBadge !== false) {
          if (hasRuntime()) {
            chrome.runtime.sendMessage({ type: 'ah:set-badge', count: Math.max(0, parseInt(count, 10) || 0) });
          }
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
    if (__serpDismissed) return null;
    ensurePanelStyles();
    let el = document.getElementById('ah-serp');
    if (el) return el;
    const box = document.createElement('div');
    const chipLabel = _('chipLabel', 'Unlock.SBS');
      box.innerHTML = `
        <div id="ah-serp">
          <button id="ah-dismiss" class="ah-btn ah-btn-ghost ah-dismiss" type="button" aria-label="${_('serpHide','Hide')}">×</button>
          <button id="ah-chip" class="ah-chip" type="button" aria-label="${_('serpPanelTitle','Search tips')}">
            <span class="ah-chip-text">
              <span id="ah-chip-icon"></span>
              <span>${chipLabel}</span>
              <span class="ah-chip-count" id="ah-chip-count">0</span>
            </span>
          </button>
          <div class="ah-serp-card">
            <div class="ah-panel-header">
              <div class="ah-panel-title"><span id="ah-panel-icon"></span><span>${_('serpPanelTitle','Search tips')}</span></div>
              <button id="ah-close-x" class="ah-btn ah-btn-ghost ah-panel-close" type="button" aria-label="${_('serpHide','Hide')}">×</button>
            </div>
          <div id="ah-mirrors" class="ah-section"></div>
          <div id="ah-bookmarks" class="ah-section"></div>
          <div id="ah-body" class="ah-panel-body"></div>
          <div id="ah-actions" class="ah-panel-actions">
            <button id="ah-settings" class="ah-btn ah-btn-outline" type="button">${_('settingsBtn','Settings')}</button>
            <button id="ah-close" class="ah-btn ah-btn-outline" type="button">${_('serpHide','Hide')}</button>
          </div>
        </div>
      </div>`;
    el = box.firstElementChild;
    document.documentElement.appendChild(el);
    const chip = el.querySelector('#ah-chip'); if (chip) chip.addEventListener('click', () => expandPanel(el));
    const collapse = () => collapsePanel(el);
    const cx = el.querySelector('#ah-close-x'); if (cx) cx.addEventListener('click', collapse);
    const closeBtn = el.querySelector('#ah-close'); if (closeBtn) closeBtn.addEventListener('click', collapse);
    const dismissBtn = el.querySelector('#ah-dismiss'); if (dismissBtn) dismissBtn.addEventListener('click', () => dismissPanel(el));
    const sb = el.querySelector('#ah-settings');
    if (sb) sb.addEventListener('click', ()=>{ try{ if(hasRuntime()) chrome.runtime.sendMessage({type:'ah:open-settings'}); }catch(e){} });
    const chipIconSlot = el.querySelector('#ah-chip-icon');
    if (chipIconSlot) chipIconSlot.appendChild(createIcon('brand', 'sm', 'main'));
    const panelIconSlot = el.querySelector('#ah-panel-icon');
    if (panelIconSlot) panelIconSlot.appendChild(createIcon('unlocked', 'sm', 'ok'));
    return el;
  }
  function dismissPanel(el) {
    __serpDismissed = true;
    setBadgeCount(0);
    try { if (el && el.remove) el.remove(); } catch(_) {}
  }
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
  }
  function makePlainLink(href, text) {
    return `<a href="${href}" target="_blank" rel="noreferrer" class="ah-inline-link">${escapeHtml(text)}</a>`;
  }
  function makePillLink(href, text) {
    const label = escapeHtml(text);
    return `<a href="${href}" target="_blank" rel="noreferrer" class="ah-pill"><span class="ah-pill-label">${label}</span><span class="ah-pill-arrow">⭢</span></a>`;
  }

  // bookmarks via background
  let __bmCache = null;
  function fetchBookmarksOnce(){
    return new Promise((resolve)=>{
      if (__bmCache) return resolve(__bmCache);
      try {
        if (!hasRuntime()) throw new Error('no-runtime');
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
    if (__serpDismissed) { setBadgeCount(0); return; }
    lastUrl = location.href;
      getPrefsAndAlternates((data) => {
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
              const headerLabel = (_('serpTipAlternates','Official alternates from your settings:') || '').replace(/:\s*$/, '');
              mirrorsWrap.appendChild(createSectionHeader('unlocked', headerLabel, 'sm', 'ok'));
            }
            const note = document.createElement('div');
            note.className = 'ah-section-note';
            note.textContent = key;
            mirrorsWrap.appendChild(note);
            const row = document.createElement('div');
            row.className = 'ah-pill-row';
            alts.forEach(a => {
              const obj = toHref(a);
              const pill = document.createElement('span');
              pill.innerHTML = makePillLink(obj.href, obj.host);
              const anchor = pill.firstElementChild; if (anchor && anchor.tagName==='A') anchor.title = obj.href; row.appendChild(anchor);
            });
            mirrorsWrap.appendChild(row);
          }
        });
      }

      if (!__prefs || __prefs.showSerpBookmarks !== false) {
        fetchBookmarksOnce().then(list => {
          if (__serpDismissed) return;
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
            if (__serpDismissed) return;
            if (shouldRenderPanel && el) updateChipCount(el, tipCount);

            if (bookmarkHits.length && shouldRenderPanel && bmWrap) {
              bmWrap.classList.add('active');
              bmWrap.appendChild(createSectionHeader('brand', _(`bookmarksHeading`,`Related bookmarks`), 'sm', 'main'));
              const row = document.createElement('div');
              row.className = 'ah-pill-row';
              bookmarkHits.forEach(h => {
                const a = document.createElement('a');
                a.className = 'ah-pill ah-pill-rich';
                a.href = h.url; a.target='_blank'; a.rel='noreferrer'; a.title = h.url;
                const img = document.createElement('img'); let host=''; try{ host=new URL(h.url).hostname; }catch{}; img.src=`https://icons.duckduckgo.com/ip3/${host}.ico`; img.className='ah-pill-icon'; img.alt='';
                const span = document.createElement('span'); span.className='ah-pill-label'; const t = h.title && h.title.trim() ? h.title.trim() : (new URL(h.url).hostname);
                span.textContent = t.length>28 ? t.slice(0,25)+'…' : t;
                const arrow = document.createElement('span'); arrow.textContent='⭢'; arrow.className='ah-pill-arrow';
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
        body.innerHTML = tips.map(t => `<div class="ah-tip">${t}</div>`).join('');
      }
    });
  }

  renderTips();
  function onUrlMaybeChanged(){ if (location.href !== lastUrl) { const el = document.getElementById('ah-serp'); if (el) el.remove(); renderTips(); } }
  const _push = history.pushState; history.pushState = function(){ _push.apply(this, arguments); setTimeout(onUrlMaybeChanged, 0); };
  const _replace = history.replaceState; history.replaceState = function(){ _replace.apply(this, arguments); setTimeout(onUrlMaybeChanged, 0); };
  window.addEventListener('popstate', onUrlMaybeChanged);
  setInterval(onUrlMaybeChanged, 800);
  try {
    if (hasRuntime() && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'ah:show-serp-panel') {
          try {
            const panel = document.getElementById('ah-serp');
            if (panel) {
              expandPanel(panel);
              sendResponse && sendResponse({ ok: true, hasTips: true });
            } else {
              showNoTipsToast();
              sendResponse && sendResponse({ ok: true, hasTips: false });
            }
          } catch (err) {
            sendResponse && sendResponse({ ok: false });
          }
        }
      });
    }
  } catch (e) {}
})();
