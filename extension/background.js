/**
 * MV3 service worker.
 *
 * Responsibilities:
 *   1. Paint badge from cached state on startup/install.
 *   2. Schedule a 60-min alarm to fetch fresh digest in the background.
 *   3. On each successful fetch: diff against previous cache, notify once
 *      for genuinely new items, update badge, persist new cache.
 *
 * Storage keys used here:
 *   cachedDigest   — { version, generated_at, item_count, items[] }
 *   seenIds        — { [id]: true }
 *   notifiedIds    — { [id]: true }  items we've already notified about
 *   lastFetchedAt  — ISO string
 */

const DIGEST_URL = 'https://medhulk8.github.io/claude-signal/digest.json';
const ALARM_NAME = 'digest-refresh';
const ALARM_PERIOD_MINUTES = 60;

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleAlarm();
  await refreshBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  await refreshBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) fetchAndNotify();
});

// Notification click → open popup
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.action.openPopup().catch(() => {
    // openPopup may fail if not triggered by a direct user gesture in some builds — ignore.
  });
  chrome.notifications.clear(notificationId);
});

// --- Alarm ---

async function scheduleAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: ALARM_PERIOD_MINUTES,
      periodInMinutes: ALARM_PERIOD_MINUTES,
    });
  }
}

// --- Fetch + diff + notify ---

async function fetchAndNotify() {
  let digest;
  try {
    const res = await fetch(DIGEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    digest = await res.json();
  } catch {
    // Fetch failed — badge stays from cached state, no notification.
    return;
  }

  const { cachedDigest, notifiedIds = {} } = await chrome.storage.local.get([
    'cachedDigest',
    'notifiedIds',
  ]);

  // Items whose IDs weren't in the previous cached digest and haven't been notified yet.
  const previousIds = new Set((cachedDigest?.items ?? []).map((i) => i.id));
  const newItems = (digest.items ?? []).filter(
    (item) => !previousIds.has(item.id) && !notifiedIds[item.id]
  );

  // Persist new cache + lastFetchedAt
  await chrome.storage.local.set({
    cachedDigest: digest,
    lastFetchedAt: new Date().toISOString(),
  });

  // Update badge
  await refreshBadge();

  // Notify only if there are genuinely new items
  if (newItems.length === 0) return;

  // Mark them as notified
  const updatedNotifiedIds = { ...notifiedIds };
  for (const item of newItems) {
    updatedNotifiedIds[item.id] = true;
  }
  await chrome.storage.local.set({ notifiedIds: updatedNotifiedIds });

  const title = 'Claude Signal';
  const message =
    newItems.length === 1
      ? newItems[0].title
      : `${newItems.length} new updates`;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    silent: false,
  });
}

// --- Badge ---

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
    // Service worker terminated before storage resolves — ignore.
  }
}
