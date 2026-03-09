/**
 * Detail page logic.
 *
 * On load: reads item from cached digest, checks local explanation cache.
 * If explanation cached → render immediately.
 * If not → call Groq API, cache result, render.
 *
 * Storage keys used:
 *   cachedDigest   — digest fetched by popup
 *   explanations   — { [id]: { what, why } } local cache
 *   groqApiKey     — set once via DevTools: chrome.storage.local.set({groqApiKey: 'gsk_...'})
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
  return `${Math.floor(diffDays / 30)}mo ago`;
}

async function fetchExplanation(item, apiKey) {
  const sourceLabel =
    item.source === 'github_releases' ? 'Claude Code' : 'Anthropic API / developer platform';
  const context =
    item.summary && item.summary !== item.title ? `\nContext: ${item.summary}` : '';

  const prompt = `You are a technical writer helping developers understand updates to Claude and the Anthropic platform.

Item: "${item.title}"
Source: ${sourceLabel}${context}

Write a short explanation with two parts:
- what: 1-2 sentences explaining what this feature/change is in plain English.
- why: 1-2 sentences on why a ${sourceLabel} user or developer should care.

Be concrete and specific. Avoid marketing language.

Respond in this exact JSON format with no other text:
{"what": "...", "why": "..."}`;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices[0].message.content.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const content = document.getElementById('content');

  if (!id) {
    content.innerHTML = '<div class="state-msg">No item ID provided.</div>';
    return;
  }

  const { cachedDigest, explanations = {}, groqApiKey } = await chrome.storage.local.get([
    'cachedDigest',
    'explanations',
    'groqApiKey',
  ]);

  const item = cachedDigest?.items?.find((i) => i.id === id);
  if (!item) {
    content.innerHTML = '<div class="state-msg">Item not found. Try reopening from the popup.</div>';
    return;
  }

  // Mark as read
  const { seenIds = {} } = await chrome.storage.local.get('seenIds');
  if (!seenIds[id]) {
    seenIds[id] = true;
    await chrome.storage.local.set({ seenIds });
  }

  renderItem(item, explanations[id] ?? null, content);

  // Already cached — done
  if (explanations[id]) return;

  // No API key set — show setup prompt
  if (!groqApiKey) {
    showApiKeyPrompt(content, item);
    return;
  }

  // Generate explanation
  showLoading(content);
  try {
    const explanation = await fetchExplanation(item, groqApiKey);
    explanations[id] = explanation;
    await chrome.storage.local.set({ explanations });
    renderItem(item, explanation, content);
  } catch (err) {
    showError(content, item, err.message);
  }
}

function renderItem(item, explanation, container) {
  const sourceConfig = SOURCE_LABELS[item.source] ?? { label: item.source_label, color: '#888' };
  const timeStr = item.published_at ? timeAgo(new Date(item.published_at)) : '';

  const explanationHtml = explanation
    ? `
      <hr class="divider" />
      <div class="detail-section">
        <div class="detail-label">What it is</div>
        <div class="detail-text">${escapeHtml(explanation.what)}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Why it matters</div>
        <div class="detail-text">${escapeHtml(explanation.why)}</div>
      </div>`
    : '';

  container.innerHTML = `
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
}

function showLoading(container) {
  const existingContent = container.innerHTML;
  // Append a loading indicator after existing item content
  const loader = document.createElement('div');
  loader.id = 'explanation-loader';
  loader.innerHTML = `
    <hr class="divider" />
    <div class="detail-no-explanation">Generating explanation…</div>
  `;
  // Replace any existing explanation area or append
  container.innerHTML = existingContent;
  container.appendChild(loader);
}

function showError(container, item, message) {
  renderItem(item, null, container);
  const errEl = document.createElement('div');
  errEl.innerHTML = `
    <hr class="divider" />
    <div class="detail-no-explanation" style="color:var(--error-text)">Failed to generate explanation: ${escapeHtml(message)}</div>
  `;
  container.appendChild(errEl);
}

function showApiKeyPrompt(container, item) {
  renderItem(item, null, container);
  const prompt = document.createElement('div');
  prompt.innerHTML = `
    <hr class="divider" />
    <div class="detail-section">
      <div class="detail-label">Groq API key required</div>
      <div class="detail-text" style="margin-bottom:8px">Set your key once to enable explanations.</div>
      <div style="display:flex;gap:6px">
        <input id="apiKeyInput" type="password" placeholder="gsk_..." style="flex:1;background:#2a2a2a;border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:12px" />
        <button id="saveKeyBtn" style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:12px;cursor:pointer">Save</button>
      </div>
    </div>
  `;
  container.appendChild(prompt);

  document.getElementById('saveKeyBtn').addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) return;
    await chrome.storage.local.set({ groqApiKey: key });
    // Re-run main with key now set
    main();
  });
}

main();
