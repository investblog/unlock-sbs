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
      if (!resp || !resp.ok) await openOptionsInSidePanel(tab.id);
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
