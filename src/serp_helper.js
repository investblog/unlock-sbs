
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
  const BRAND_ICON_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJtMTEuODI5IDYxLjY2NiAzLjYxOS0xMi4xOS0xMC41MjIgMi45OGM2Ljg5LTQuOTUgMTMuODMyLTkuNzk1IDIwLjY1LTE0Ljk0NWwtMy44MDYtMS45NDIgOS41MS00Ljk4OS0uMDM4LS4wOTJjLTEuNTY0LjU1NS0zLjEzOCAxLjA4Ni00LjY5MSAxLjY3LTEuOTk1Ljc1Mi0zLjk3MiAxLjU1My01Ljk2NCAyLjMxNGEuNjcuNjcgMCAwIDEtLjUzOS0uMDU3IDc2IDc2IDAgMCAxLTkuNTU1LTcuOTM0Yy0uMDYzLS4wNjMtLjExNi0uMTM3LS4yMDQtLjI0NGExMTEuNSAxMTEuNSAwIDAgMCAxNi4yMTUgMS41OWMtMi4zMDMtLjQ0LTQuNjA0LS44OS02LjkwOS0xLjMxOHEtMy4yMTUtLjU5OC02LjQzOC0xLjE2M2MtMS4yMzQtLjIxOC0yLjQ3My0uNDA3LTMuNzA3LS42MjMtLjE0OC0uMDI2LS4zMzItLjEwNy0uNDE0LS4yMjMtMi41Mi0zLjUzNC00Ljk2OC03LjExNS02Ljk5NS0xMC45NjMtLjA5LS4xNzEtLjE2NC0uMzUtLjI5Mi0uNjIyTDIzLjI0IDIxLjY2bC4wMzItLjA2OGMtLjg5LS40NzMtMS43NzktLjk1LTIuNjctMS40Mi0zLjU1OS0xLjg3Ni03LjEyLTMuNzUtMTAuNjc1LTUuNjM1YS45LjkgMCAwIDEtLjM5MS0uNDE2QzguMTA1IDEwLjU4MyA2LjY4OCA3LjA0IDUuMjcgMy40OTVjLS4wMDktLjAyMi4wMS0uMDU2LjAyNS0uMTIyIDEuNDM4Ljg5OSAyLjg2NyAxLjc4OSA0LjI5MyAyLjY4MyA2LjI3NSAzLjkzMiAxMi41NSA3Ljg2MyAxOC44MiAxMS44MDQuMzEuMTk1LjU4OC40NTUuODQ2LjcyIDIuMDMgMi4wNzggNC4wNjcgNC4xNTMgNi4wNzQgNi4yNTQgMi4wOTMgMi4xOTIgNC4xNTYgNC40MTIgNi4yMyA2LjYxOS4wNTMuMDU1LjA5OS4xMTUuMTU0LjE4LTQuNjk2IDMuMDU1LTkuNjg2IDUuNi0xNC4yMjggOC44NzRsMTYuNjk3LTguMjQzLTguMzIzLTguNzY2IDEuOTEzLTEuNDZjMS40MTgtMS4wODIgMi44MzItMi4xNyA0LjI1Ni0zLjI0NiAxLjA5LS44MjQgMi4zNTQtMS4yMTMgMy42ODItMS40MyAyLjY0LS40MzQgNC43MjEuNjA5IDYuNDggMi40NzUuMzgzLjQwNi43MTcuODU4IDEuMDk2IDEuMjY3LjEzOS4xNS4zMjkuMjc0LjUyLjM0OS44MTYuMzE3IDEuNjQuNjEgMi40ODQgMS4wMTctLjY1Ny4yMjYtMS4zLjUxLTEuOTcyLjY2NS0xLjY0Ni4zNzgtMy4xMjQgMS4wNTktNC40MTEgMi4xNjYtLjQyNS4zNjUtLjczNC43NjUtLjkxMyAxLjMwNS0uODc1IDIuNjM3LTEuNzM3IDUuMjgtMi42NzUgNy44OTQtLjkgMi41MDMtMi42MjQgNC4zODUtNC42OTEgNi4wMDQtMi4yMzggMS43NTMtNC43ODcgMi43MzMtNy41NSAzLjI2NS0yLjMxMi40NDUtNC42MzIuMzg1LTYuOTU5LjIzMS0uNDgtLjAzMS0uOTU5LS4wODgtMS40MzgtLjA5Mi0uMTI4IDAtLjI5NS4xMjUtLjM3OS4yNC0xLjY0NyAyLjI1NC0zLjIzNyA0LjU1My00LjkzNiA2Ljc2Ni0yLjc1MSAzLjU4MS01LjU3MyA3LjEwNy04LjM2NiAxMC42NTQtLjAyNC4wMzEtLjA3LjA0NC0uMTY3LjF6IiBmaWxsPSJjdXJyZW50Q29sb3IiLz48cGF0aCBkPSJNMzguMDIzIDUuNTIyYzIuMzkgMy4wNzcgMy44MyA2LjU3NSA0Ljg2OCAxMC4yNjMuMDM2LjEyNC0uMDU2LjM2Ni0uMTY0LjQzNS0uNjEuMzkyLTEuMjQyLjc0OC0xLjg5MSAxLjEzLS4zOS0xLjE1OC0uNzU4LTIuMzI5LTEuMTc4LTMuNDgtLjkzMS0yLjU1Ni0yLjA1Ni01LjAxNS0zLjgxNC03LjEzLS43NzYtLjkzNC0xLjY5NC0xLjY4OC0yLjkxNS0xLjk3LTEuNTk3LS4zNjctMi45MjEuMTcyLTQuMDgyIDEuMjUtMS43ODUgMS42Ni0yLjk2NiAzLjcyLTMuOTI3IDUuOTI0LS4yMDIuNDY0LS4zOTcuOTMtLjYwMyAxLjQxNmwtMi4xLTEuMzVjLjkxNS0yLjI3NyAxLjg4Ni00LjQ5NSAzLjY0LTYuNDQ1LS40OC4xMTMtLjgyOC4xODQtMS4xNy4yNzdhMzIuMiAzMi4yIDAgMCAwLTYuOTU4IDIuNzkyYy0uMjUxLjEzNy0uNDMuMTM1LS42Ny0uMDE0LS42NTgtLjQwOC0xLjMzNC0uNzg2LTIuMDU1LTEuMjA0LjEzMy0uMDk1LjIzNi0uMTczLjM0NC0uMjQyIDMuNjY3LTIuMzI1IDcuNjQxLTMuODUyIDExLjkzLTQuNTI4IDIuMzctLjM3MyA0Ljc2LS4zNiA3LjE1NC0uMjM2IDMuNTI2LjE4NSA2Ljg1NiAxLjExNCAxMC4wNzYgMi41MTEuMTU0LjA2Ny4zODkuMDYuNTQ2LS4wMDYgMi4yMDctLjk0NCA0LjI3LS4wMjcgNC43MTcgMi42NC4wNS4zLjE0Mi40OTkuMzc2LjY5MiAyLjc2IDIuMjg3IDUuMzM2IDQuNzU2IDcuMzY5IDcuNzMzIDIuMzE3IDMuMzkzIDMuODU2IDcuMTExIDQuNTMyIDExLjE3NS4wOTYuNTguMTg0IDEuMTYyLjI5NSAxLjczOC4wMjIuMTIuMTA0LjI1NS4yMDEuMzI3IDEuODY3IDEuMzc0IDEuOTU1IDMuNTU4LjE3IDUuMDMtLjMxNC4yNTgtLjQzNy41MTctLjUwNS45MTUtLjU0OSAzLjIxNS0xLjQ3NyA2LjMxLTIuOTQ1IDkuMjM4YTMxLjggMzEuOCAwIDAgMS03LjU1OSA5Ljc2NGMtLjI3OC4yNDMtLjQwNy40ODItLjQxLjg2NC0uMDE0IDEuNjQ1LS44MjUgMi44NjQtMi4xNzIgMy4yMDQtLjc3NS4xOTUtMS41NzcuMTYyLTIuMzExLS4yMTgtLjI1Mi0uMTMxLS40MzctLjEwOS0uNjc4LjAxMi0yLjgwOSAxLjM5Ny01LjczIDIuNDgzLTguODIgMy4wNTQtMi40MzUuNDUtNC44OS41OTYtNy4zNy40Mi00LjM5MS0uMzE2LTguNDg3LTEuNi0xMi4zNi0zLjY1Mi0uMDgyLS4wNDItLjE2MS0uMDktLjI2OC0uMTVsMS41NDctMS45NzQgNy4wNjIgMi43MmMtLjcxLTEuMTY0LTEuNDE4LTIuMTU2LTEuOTUtMy4yMzUtLjY0LTEuMjk4LTEuMTM2LTIuNjY4LTEuNjc5LTQuMDEzLS4wNTQtLjEzNi0uMDY2LS4zNTMuMDA3LS40NjMuNTMtLjc5OCAxLjA4Ny0xLjU4IDEuNjM5LTIuMzcyLjM1OSAxLjA0MS42OTYgMi4wNzcgMS4wNzQgMy4wOTkuNzUyIDIuMDMgMS42OTQgMy45NiAzLjE0NSA1LjU5NC45MTUgMS4wMzEgMiAxLjgwNCAzLjQxNCAyLjAwNCAxLjU4Ni4yMjUgMi44ODctLjM3OSA0LjAyNi0xLjQwNyAxLjc5My0xLjYxOSAyLjg3My0zLjcwMiAzLjc5Ny01Ljg4NyAxLjIyNC0yLjg5NSAxLjg4LTUuOTQ2IDIuNTA4LTkuMDA0LjAzMi0uMTYuMDg0LS4zNTQuMTk3LS40NTIuOTY2LS44NDYgMS45NDctMS42NzQgMi45NjItMi41MzktLjIwMy45NjgtLjQwMSAxLjkyMi0uNjA1IDIuODc0LS4zODIgMS44LS43NzYgMy41OTYtMS4xMzggNS4zOTktLjAzMi4xNjMuMDc3LjQyMi4yMDcuNTRhMzI2IDMyNiAwIDAgMCA0LjA3NSAzLjYyM2MuMTAzLjA5LjI3LjEzMi40MTMuMTUxLjQ5LjA2My45ODMuMTE5IDEuNDc3LjE1LjExNS4wMDcuMjYzLS4wNjYuMzU0LS4xNDggMy42MjctMy4yODQgNi40OTUtNy4xMDcgOC4yNDctMTEuNzFhMjUgMjUgMCAwIDAgMS40NTgtNS44MzNjLjAxNS0uMTItLjA2NS0uMjc3LS4xNS0uMzc4YTE5IDE5IDAgMCAwLTEuMDY3LTEuMjExLjc3Ljc3IDAgMCAwLS40OTctLjIwOWMtMS43MjUtLjAxNC0zLjQ1LS4wMDktNS4xNzYtLjAxaC0zLjk2NWMuMjY2LS43NzguNDk0LTEuNDkyLjc2Ny0yLjE4OS4wNC0uMTA0LjI4NS0uMTg0LjQzNS0uMTg1IDIuNTgtLjAwOSA1LjE2Mi0uMDE0IDcuNzQyLjAwOC4zOTEuMDAzLjU5Ny0uMTAyLjc4LS40NTguMTcxLS4zMzQuNDI2LS42OTEuNzQtLjg2OS40MzMtLjI0NC40MDgtLjU2Mi4zNTgtLjkyNi0uNzgzLTUuNzczLTMuMjQ4LTEwLjcxOC03LjM4My0xNC44MTItMS4xNjgtMS4xNTctMi40NDMtMi4yMDUtMy42NTItMy4zMi0uMjI4LS4yMTEtLjQwMy0uMTgyLS42NTQtLjA4Ni0xLjUwNS41NzUtMi45OC4xNTYtMy43MS0xLjEwNS0uMjM4LS40MTMtLjI5NS0uOTI5LS40NTItMS4zOTItLjA0Ny0uMTQtLjEyMi0uMzQtLjIzLS4zNzgtMS43NjYtLjYwNy0zLjU0LTEuMTkzLTUuMzEyLTEuNzgyLS4wMjctLjAwOC0uMDYuMDA1LS4xMDEuMDA5em0uNjIxIDUyLjU5MmMuMDczLjAwNS4xMjIuMDIuMTYzLjAwOWEzNi43IDM2LjcgMCAwIDAgNi4yOTQtMi40NTguNDYuNDYgMCAwIDAgLjIxMy0uMjYyYy4xNTEtLjU0My4yODItMS4wOTIuNDQtMS43MTRsLTMuMjQ4LTIuODIyYy0uOTcgMi42MTEtMi4wMzEgNS4xMjUtMy44NjEgNy4yNDdNMy45NjQgMjAuODE5Yy41MzYuOTIgMS4wNjYgMS44MjIgMS41OCAyLjczMi4wNDcuMDg1LjAxMy4yMzEtLjAxNC4zNDEtLjM4OCAxLjU3NC0uNzc1IDMuMTQ5LTEuMTgxIDQuNzE4LS4wNzIuMjc3LjAzMi4zODIuMjMxLjU2LjM5OC4zNTMuNzY3Ljc1NiAxLjA2OCAxLjE5NC4xNS4yMTYuMjY1LjI4LjUwNC4yOCAxLjkyNy0uMDA3IDMuODU0LS4wMDggNS43ODEuMDEuMjEyLjAwMi40NTguMDg1LjYyNi4yMTMuNzE4LjU0MyAxLjQxNCAxLjExNCAyLjExNSAxLjY4LjEyNi4xMDIuMjMuMjMxLjQzOC40NDRoLTMuMDdjLTEuOTU4IDAtMy45MTcuMDA1LTUuODc1LS4wMDYtLjI5Ny0uMDAyLS40NDguMDk0LS42Mi4zNWE1LjcgNS43IDAgMCAxLS45OSAxLjA4OGMtLjIxNi4xODYtLjMwMi4zMzUtLjI1LjYxMi43NzEgNC4wOTIgMi4yMDIgNy45MTggNC41NDYgMTEuMzguMTExLjE2NS4yMTUuMzM1LjMzOS41MzFMNy4wMDUgNDguNTljLS41OTYtLjk4OS0xLjItMS45MjMtMS43MzgtMi44OTVhMjkuOCAyOS44IDAgMCAxLTMuNDgtMTAuNDA3Yy0uMDctLjQ5MS0uMjU1LS44NDgtLjY3My0xLjE3OC0xLjUyMy0xLjIwMy0xLjQ3Ni0zLjU3LjA5LTQuNzA0LjM4Ny0uMjguNTE2LS41OTYuNTg4LTEuMDEzYTM5IDM5IDAgMCAxIDIuMDY4LTcuNDQ1Yy4wMTUtLjA0LjA1Ni0uMDY5LjEwNi0uMTI2eiIgZmlsbD0iY3VycmVudENvbG9yIi8+PC9zdmc+';
  const PANEL_STYLE_ID = 'ah-serp-style';
  const TOAST_ID = 'ah-serp-toast';

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
      #ah-serp-toast { position:fixed; top:16px; right:16px; z-index:2147483647; background:#121a2b; color:#e7ecf3; border:1px solid #223052; border-radius:10px; padding:8px 12px; box-shadow:0 10px 24px rgba(0,0,0,.25); opacity:0; transform:translateY(-8px); transition:opacity .16s ease, transform .16s ease; pointer-events:none; font-family:Roboto, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; font-size:13px; }
      #ah-serp-toast.visible { opacity:1; transform:translateY(0); }
      #ah-serp:not(.ah-serp-expanded) .ah-panel { display:none; }
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
          <span class="ah-chip-icon">${BRAND_ICON_DATA_URL ? `<img src="${BRAND_ICON_DATA_URL}" alt="" />` : ''}</span>
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
})();
