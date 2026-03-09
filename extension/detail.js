const SOURCE_LABELS = {
  github_releases: { label: 'Claude Code', color: '#2DA44E' },
  anthropic_changelog: { label: 'Anthropic', color: '#CC785C' },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const content = document.getElementById('content');

  if (!id) {
    content.innerHTML = '<div class="state-msg">No item ID provided.</div>';
    return;
  }

  const { cachedDigest } = await chrome.storage.local.get('cachedDigest');
  const item = cachedDigest?.items?.find((i) => i.id === id);

  if (!item) {
    content.innerHTML = '<div class="state-msg">Item not found in cache.</div>';
    return;
  }

  const sourceConfig = SOURCE_LABELS[item.source] ?? { label: item.source_label, color: '#888' };
  const timeStr = item.published_at ? timeAgo(new Date(item.published_at)) : '';

  const explanationHtml = item.explanation
    ? `
      <hr class="divider" />
      <div class="detail-section">
        <div class="detail-label">What it is</div>
        <div class="detail-text">${escapeHtml(item.explanation.what)}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Why it matters</div>
        <div class="detail-text">${escapeHtml(item.explanation.why)}</div>
      </div>
    `
    : `<hr class="divider" /><div class="detail-no-explanation">No explanation available for this item yet.</div>`;

  content.innerHTML = `
    <div class="detail-meta">
      <span class="badge badge--source" style="background:${sourceConfig.color}22;color:${sourceConfig.color}">${escapeHtml(sourceConfig.label)}</span>
      <span class="badge badge--type">${escapeHtml(item.type)}</span>
      <span class="detail-time">${timeStr}</span>
    </div>
    <div class="detail-title">${escapeHtml(item.title)}</div>
    ${item.summary && item.summary !== item.title ? `<div class="detail-text" style="color:var(--text-dim);font-size:12px;margin-top:-8px;margin-bottom:4px">${escapeHtml(item.summary)}</div>` : ''}
    ${explanationHtml}
    <a class="detail-source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">View original source →</a>
  `;

  // Mark as read
  const { seenIds = {} } = await chrome.storage.local.get('seenIds');
  if (!seenIds[id]) {
    seenIds[id] = true;
    await chrome.storage.local.set({ seenIds });
  }
}

main();
