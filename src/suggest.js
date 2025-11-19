function _(id, fallback=''){ try { return chrome.i18n.getMessage(id) || fallback; } catch(e){ return fallback; } }

function parseHash() {
  if (!location.hash) {
    try {
      chrome.storage.local.get('__ah_sidepanel_params', (v) => {
        const raw = v && v.__ah_sidepanel_params || '';
        if (raw) { history.replaceState(null, '', raw); location.reload(); }
      });
    } catch(e){}
  }
  const h = location.hash.slice(1);
  const params = new URLSearchParams(h);
  return { url: params.get('u') || '', err: params.get('e') || '' };
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; }
}

function setStateIndicator(hasTips) {
  const row = document.getElementById('stateRow');
  const icon = document.getElementById('stateIcon');
  const text = document.getElementById('stateText');
  if (!row || !icon || !text) return;
  const unlocked = !!hasTips;
  row.classList.toggle('state-ok', unlocked);
  row.classList.toggle('state-wait', !unlocked);
  try {
    icon.src = chrome.runtime.getURL(unlocked ? 'icons/unlocked.svg' : 'icons/locked.svg');
  } catch (e) { icon.removeAttribute('src'); }
  text.textContent = unlocked ? _('stateUnlocked','Tips ready') : _('stateLocked','Waiting for tips');
}

function buildLink(href, text, id) {
  const a = document.createElement('a');
  a.className = 'btn';
  a.href = href;
  a.textContent = text;
  if (id) a.id = id;
  a.target = '_blank';
  a.rel = 'noreferrer';
  return a;
}

async function loadAlternates(domain) {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ alternates: {} }, (data) => {
      const map = data.alternates || {};
      const alts = map[domain] || map[domain.replace(/^www\./, '')] || [];
      resolve(Array.isArray(alts) ? alts : []);
    });
  });
}

(async function main() {
  const { url, err } = parseHash();
  const domain = hostname(url);
  setStateIndicator(false);
  document.getElementById('meta').textContent = `${_('labelURL','URL')}: ${url} · ${_('labelError','Error')}: ${err || _('labelUnknown','unknown')}`;

  const quick = document.getElementById('quick');
  try {
    const u = new URL(url);
    const toggledProtocol = u.protocol === 'https:' ? 'http:' : 'https:';
    const retryToggled = `${toggledProtocol}//${u.host}${u.pathname}${u.search}`;
    const retrySame = url;
    quick.appendChild(buildLink(retrySame, _('labelRetry','Retry')));
    quick.appendChild(buildLink(retryToggled, `${_('labelTry','Try')} ${toggledProtocol.replace(':','').toUpperCase()}`));
  } catch {}

  // Wayback scheme-less target
  const wayback = document.getElementById('wayback');
  let bare = '';
  try { const wu = new URL(url); bare = `${wu.host}${wu.pathname}${wu.search}`; }
  catch { bare = String(url).replace(/^[a-z]+:\/\//i, ''); }
  wayback.href = `https://web.archive.org/web/*/${bare}`;

  const sameDomainSearch = document.getElementById('sameDomainSearch');
  sameDomainSearch.href = domain ? `https://www.google.com/search?q=site%3A${encodeURIComponent(domain)}` : `https://www.google.com/`;

  const list = document.getElementById('alts');
  const empty = document.getElementById('alts_empty');
  const alts = domain ? (await loadAlternates(domain)) : [];
  if (!alts.length) { empty.style.display = ''; }
  else {
    alts.forEach(d => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'pill';
      a.href = `https://${d.replace(/^https?:\/\//,'')}`;
      a.innerHTML = `${d} <span class="arrow">⭢</span>`;
      a.target = '_blank'; a.rel = 'noreferrer';
      li.appendChild(a); list.appendChild(li);
    });
  }
  setStateIndicator(alts.length > 0);

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const txt = _(key, el.textContent);
    if (txt) el.textContent = txt;
  });
})();
// open settings in side panel via background
const btn = document.getElementById('openSettings');
if (btn) btn.addEventListener('click', ()=>{ try{ chrome.runtime.sendMessage({type:'ah:open-settings'});}catch(e){} });
