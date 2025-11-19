async function openInSidePanel(tabId, url){
  if (!chrome.sidePanel || !chrome.sidePanel.open) throw new Error('no-sidepanel');
  await chrome.sidePanel.setOptions({ tabId, path: 'suggest.html', enabled: true });
  await chrome.sidePanel.open({ tabId });
  await chrome.storage.local.set({ __ah_sidepanel_params: url });
}
function isSearchURL(u) {
  try {
    const url = new URL(u);
    const h = url.hostname, p = url.pathname || "";
    if (h.startsWith('www.google.') && p.startsWith('/search')) return true;
    if (h === 'www.bing.com' && p.startsWith('/search')) return true;
    if (h === 'duckduckgo.com') return true;
    if (/^yandex\./i.test(h) && /search/i.test(p)) return true;
    if ((/(^|\.)ya\.ru$/i).test(h) && /search/i.test(p)) return true;
    return false;
  } catch { return false; }
}
const HARD_ERROR_RX = /(ERR_NAME_NOT_RESOLVED|DNS_PROBE_FINISHED|ERR_CONNECTION_|ERR_TIMED_OUT|ERR_SSL|ERR_ADDRESS_UNREACHABLE|ERR_INTERNET_DISCONNECTED|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED|ERR_FAILED)/i;

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  try {
    if (details.frameId !== 0) return;
    const url = details.url || "";
    if (url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
    const err = String(details.error || '');
    if (/ERR_ABORTED/i.test(err) || /ERR_BLOCKED_BY_CLIENT/i.test(err)) return;
    if (isSearchURL(url)) return;
    if (!HARD_ERROR_RX.test(err)) return;

    const paramUrl = '#u=' + encodeURIComponent(url) + '&e=' + encodeURIComponent(err);
    const full = chrome.runtime.getURL('suggest.html') + paramUrl;

    try {
      await openInSidePanel(details.tabId, full);
      await chrome.storage.local.set({ __ah_sidepanel_params: paramUrl });
    } catch (e) {
      try {
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
        chrome.action.setBadgeText({ text: '!' });
      } catch (_) {}
      // Do not override the tab's URL; the side panel (and badge) act as the indicator.
    }
  } catch(e) { /* ignore */ }
});

async function openOptionsInSidePanel(tabId){
  try {
    if (!chrome.sidePanel || !chrome.sidePanel.open) throw new Error('no-sidepanel');
    await chrome.sidePanel.setOptions({ tabId, path: 'options.html', enabled: true });
    await chrome.sidePanel.open({ tabId });
  } catch(e) {
    // Fallback: open options.html in a new tab
    await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
}
function getBadgeCount(tabId){
  return new Promise((resolve) => {
    try {
      chrome.action.getBadgeText({ tabId }, (text) => {
        if (chrome.runtime.lastError) return resolve(0);
        const n = parseInt(text || '', 10);
        resolve(Number.isFinite(n) ? n : 0);
      });
    } catch (e) { resolve(0); }
  });
}
function getStoredPanelHash(){
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('__ah_sidepanel_params', (val) => {
        if (chrome.runtime.lastError) return resolve('');
        const raw = val && val.__ah_sidepanel_params;
        resolve(typeof raw === 'string' ? raw : '');
      });
    } catch (e) { resolve(''); }
  });
}
async function openSuggestionsPopup(url){
  try {
    await chrome.windows.create({
      url,
      type: 'popup',
      width: 420,
      height: 600,
      focused: true
    });
  } catch (popupError) {
    await chrome.tabs.create({ url });
  }
}
async function openSuggestionsForTab(tabId){
  const hash = await getStoredPanelHash();
  const suffix = hash && hash.startsWith('#') ? hash : (hash ? `#${hash}` : '');
  const base = chrome.runtime.getURL('suggest.html');
  const target = `${base}${suffix}`;
  try {
    await openInSidePanel(tabId, target);
    if (hash) await chrome.storage.local.set({ __ah_sidepanel_params: hash });
  } catch (e) {
    await openSuggestionsPopup(target);
  }
}
function requestSerpPanel(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'ah:show-serp-panel' }, (resp) => {
        if (chrome.runtime.lastError) return resolve({ ok: false });
        resolve(resp && typeof resp === 'object' ? resp : { ok: false });
      });
    } catch (e) {
      resolve({ ok: false });
    }
  });
}
function isEmptyTab(tab) {
  const url = String((tab && tab.url) || '').trim();
  if (!url) return true;
  return (
    /^about:blank$/i.test(url) ||
    /^(chrome|edge):\/\/newtab\/?/i.test(url) ||
    /^chrome-search:\/\/local-ntp\//i.test(url)
  );
}
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    if (isEmptyTab(tab)) {
      await openOptionsInSidePanel(tab.id);
      return;
    }
    const badgeCount = await getBadgeCount(tab.id);
    if (badgeCount > 0) {
      const resp = await requestSerpPanel(tab.id);
      if (!resp || !resp.ok) await openSuggestionsForTab(tab.id);
    }
    else await openOptionsInSidePanel(tab.id);
  } catch (e) {
    await openOptionsInSidePanel(tab.id);
  }
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ah:open-settings' && sender && sender.tab && sender.tab.id) {
    openOptionsInSidePanel(sender.tab.id);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ah:get-bookmarks') {
    try {
      chrome.bookmarks.getTree((nodes) => {
        const flat = [];
        const walk = (arr) => { for (const x of arr || []) { if (x.url) flat.push({ title: x.title || '', url: x.url }); if (x.children) walk(x.children); } };
        walk(nodes || []);
        sendResponse({ ok: true, items: flat });
      });
      return true; // async
    } catch (e) {
      sendResponse({ ok: false, items: [] });
    }
  }
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ah:set-badge') {
    const n = Math.max(0, parseInt(msg.count || 0, 10) || 0);
    try {
      chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
      chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
    } catch (e) {}
    sendResponse && sendResponse({ ok: true });
    return; // no async
  }
});
