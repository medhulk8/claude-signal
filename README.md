# Claude Signal

A Chrome extension that surfaces high-signal updates from Claude Code and the Anthropic developer platform — filtered, explained, and delivered as a browser badge.

## What it does

- Pulls Claude Code GitHub releases and Anthropic changelog entries
- Filters out noise (bug fixes, minor improvements) — keeps new features, breaking changes, deprecations
- Generates a plain-English explanation for each item using an LLM (what it is, why it matters, how to use it)
- Shows unread count as a browser badge
- Detail page per item with structured explainer

## Architecture

```
GitHub Actions (every 1h)
  → scripts/fetch.js       — fetches Atom feed + scrapes changelog
  → scripts/normalize.js   — deduplicates, sorts, retains top 90 items
  → scripts/explain.js     — generates explanations via Groq (idempotent)
  → digest.json            — published to GitHub Pages

Chrome Extension (MV3)
  → popup.js               — fetches digest.json, renders Unread/All tabs
  → detail.js              — shows full explanation for a clicked item
  → chrome.storage.local   — caches digest + read state
```

No backend. No database. No user accounts.

## Setup (self-hosting)

### 1. Fork the repo

### 2. Enable GitHub Pages
Go to **Settings → Pages** and set source to the root of `main`.

### 3. Add your Groq API key
Go to **Settings → Secrets → Actions** and add:
```
GROQ_API_KEY = your_key_here
```
Free tier at [console.groq.com](https://console.groq.com) is sufficient.

### 4. Update the digest URL in the extension
In `extension/popup.js`, set `DIGEST_URL` to your Pages URL:
```js
const DIGEST_URL = 'https://YOUR_USERNAME.github.io/claude-signal/digest.json';
```
Also update `host_permissions` in `extension/manifest.json` to match.

### 5. Load the extension in Chrome
Go to `chrome://extensions`, enable Developer mode, click **Load unpacked**, select the `extension/` folder.

### 6. Trigger the first run
Push a commit or manually trigger the **Update digest** workflow under **Actions**.

## Manual digest generation

```bash
npm install
GROQ_API_KEY=your_key npm run generate
```

## Signal filtering

**GitHub releases** — whitelist: keeps only `Added X` bullets, deprecations, breaking changes.

**Anthropic changelog** — blacklist: drops bullets starting with Fixed / Resolved / Improved / Updated / Reduced / Enhanced.

## Explanation schema

Each item in `digest.json` may contain:

```json
"explanation": {
  "what_it_is": "...",
  "why_it_matters": "...",
  "how_to_use": ["...", "..."]
}
```

Explanations are generated once per item and carried over in subsequent runs (idempotent).
