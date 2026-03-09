/**
 * Popup logic.
 *
 * Storage shape:
 *   cachedDigest:  { version, generated_at, item_count, items[] }
 *   seenIds:       { [id]: true }
 *   lastFetchedAt: ISO string
 *
 * Stale states (two distinct modes):
 *   A) Pipeline stale: digest.generated_at is old (GitHub Action may be broken)
 *   B) Local cache stale: fetch failed, showing cached data
 */

// !! Set this to your GitHub Pages URL after enabling Pages on the repo.
// e.g. https://medhul.github.io/claude-signal/digest.json
const DIGEST_URL = 'https://medhulk8.github.io/claude-signal/digest.json';

const CACHE_TTL_MS = 60 * 60 * 1000;         // Refresh if cache older than 60 min
const PIPELINE_STALE_MS = 12 * 60 * 60 * 1000; // Warn if generated_at older than 12h

const SOURCE_LABELS = {
  github_releases: { label: 'Claude Code', color: '#2DA44E' },
  anthropic_changelog: { label: 'Anthropic', color: '#CC785C' },
};

// --- Main ---

async function main() {
  const { cachedDigest, seenIds = {}, lastFetchedAt } = await chrome.storage.local.get([
    'cachedDigest',
    'seenIds',
    'lastFetchedAt',
  ]);

  let digest = cachedDigest ?? null;
  let fetchError = null;
  let usingStaleCache = false;

  const needsFetch =
    !lastFetchedAt ||
    Date.now() - new Date(lastFetchedAt).getTime() > CACHE_TTL_MS;

  if (needsFetch) {
    try {
      const res = await fetch(DIGEST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      digest = await res.json();
      await chrome.storage.local.set({
        cachedDigest: digest,
        lastFetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      fetchError = err.message;
      usingStaleCache = !!cachedDigest;
      digest = cachedDigest ?? null;
    }
  }

  let activeTab = 'unread';

  renderStatusBar(digest, fetchError, usingStaleCache, lastFetchedAt);
  renderItems(digest, seenIds, activeTab);
  renderFooter(digest);
  updateBadge(digest, seenIds);

  document.getElementById('markAllRead').addEventListener('click', () =>
    markAllRead(digest, seenIds)
  );

  document.getElementById('tabUnread').addEventListener('click', () => {
    activeTab = 'unread';
    document.getElementById('tabUnread').classList.add('tab--active');
    document.getElementById('tabAll').classList.remove('tab--active');
    renderItems(digest, seenIds, activeTab);
  });

  document.getElementById('tabAll').addEventListener('click', () => {
    activeTab = 'all';
    document.getElementById('tabAll').classList.add('tab--active');
    document.getElementById('tabUnread').classList.remove('tab--active');
    renderItems(digest, seenIds, activeTab);
  });
}

// --- Render ---

function renderStatusBar(digest, fetchError, usingStaleCache, lastFetchedAt) {
  const bar = document.getElementById('statusBar');

  if (fetchError && !usingStaleCache) {
    // Fetch failed, no cache
    bar.textContent = `Couldn't load feed: ${fetchError}`;
    bar.className = 'status-bar status-error';
    return;
  }

  if (fetchError && usingStaleCache) {
    // Fetch failed, showing stale local cache
    const ago = lastFetchedAt ? timeAgo(new Date(lastFetchedAt)) : 'unknown';
    bar.textContent = `Couldn't refresh — showing cached data from ${ago}`;
    bar.className = 'status-bar status-warn';
    return;
  }

  if (digest?.generated_at) {
    const pipelineAge = Date.now() - new Date(digest.generated_at).getTime();
    if (pipelineAge > PIPELINE_STALE_MS) {
      // Pipeline stale — GitHub Action may not have run
      const ago = timeAgo(new Date(digest.generated_at));
      bar.textContent = `Source data may be stale — last generated ${ago}`;
      bar.className = 'status-bar status-warn';
      return;
    }
  }

  bar.className = 'status-bar hidden';
}

function renderItems(digest, seenIds, tab = 'unread') {
  const list = document.getElementById('itemList');

  if (!digest) {
    list.innerHTML = '<div class="state-msg">No data available. Try again later.</div>';
    return;
  }

  if (!digest.items || digest.items.length === 0) {
    list.innerHTML = '<div class="state-msg">No updates yet.</div>';
    return;
  }

  const items = tab === 'unread'
    ? digest.items.filter((item) => !seenIds[item.id])
    : digest.items;

  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<div class="state-msg">All caught up.</div>';
    return;
  }

  for (const item of items) {
    const isRead = !!seenIds[item.id];
    const sourceConfig = SOURCE_LABELS[item.source] ?? { label: item.source_label, color: '#888' };

    const el = document.createElement('a');
    el.href = chrome.runtime.getURL('detail.html') + '?id=' + item.id;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.className = `item${isRead ? ' item--read' : ''}`;

    el.innerHTML = `
      <div class="item-meta">
        <span class="badge badge--source" style="background:${sourceConfig.color}22;color:${sourceConfig.color}">${escapeHtml(sourceConfig.label)}</span>
        <span class="badge badge--type">${escapeHtml(item.type)}</span>
        <span class="item-time">${item.published_at ? timeAgo(new Date(item.published_at)) : ''}</span>
      </div>
      <div class="item-title">${escapeHtml(item.title)}</div>
      ${item.summary && item.summary !== item.title ? `<div class="item-summary">${escapeHtml(item.summary)}</div>` : ''}
    `;

    el.addEventListener('click', () => markRead(item.id, el));
    list.appendChild(el);
  }
}

function renderFooter(digest) {
  const footer = document.getElementById('footer');
  if (!digest?.generated_at) {
    footer.textContent = '';
    return;
  }
  const gen = timeAgo(new Date(digest.generated_at));
  footer.textContent = `Last generated ${gen}`;
}

// --- Actions ---

async function markRead(id, el) {
  const { seenIds = {} } = await chrome.storage.local.get('seenIds');
  seenIds[id] = true;
  await chrome.storage.local.set({ seenIds });
  el.classList.add('item--read');

  const { cachedDigest } = await chrome.storage.local.get('cachedDigest');
  updateBadge(cachedDigest, seenIds);
}

async function markAllRead(digest, currentSeenIds) {
  if (!digest?.items) return;
  const seenIds = { ...currentSeenIds };
  for (const item of digest.items) {
    seenIds[item.id] = true;
  }
  await chrome.storage.local.set({ seenIds });
  // Re-render all items as read
  document.querySelectorAll('.item').forEach((el) => el.classList.add('item--read'));
  updateBadge(digest, seenIds);
}

async function updateBadge(digest, seenIds) {
  if (!digest?.items) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const unread = digest.items.filter((item) => !seenIds[item.id]).length;
  await chrome.action.setBadgeText({ text: unread > 0 ? String(unread) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#CC785C' });
}

// --- Utils ---

function timeAgo(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main();
