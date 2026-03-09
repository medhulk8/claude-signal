/**
 * MV3 service worker — minimal.
 * Sole job: initialize badge from cached data on startup/install.
 * Badge is also refreshed by popup.js on every popup open.
 */

chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);

async function refreshBadge() {
  try {
    const { cachedDigest, seenIds = {} } = await chrome.storage.local.get([
      'cachedDigest',
      'seenIds',
    ]);
    if (!cachedDigest?.items) return;
    const unread = cachedDigest.items.filter((item) => !seenIds[item.id]).length;
    await chrome.action.setBadgeText({ text: unread > 0 ? String(unread) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#CC785C' });
  } catch {
    // Service worker may be terminated before storage resolves — ignore silently.
  }
}
