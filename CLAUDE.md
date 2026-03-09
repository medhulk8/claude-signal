# claude-signal

## Current Status
**Phase: Pre-implementation. Planning complete. Ready to build data pipeline.**

Sources locked. Schema locked. Architecture locked. No code written yet.

---

## Locked Architecture Decisions

Do not re-litigate these.

- **Extension type:** Chrome MV3, unpacked (personal use first, open-sourceable later)
- **Architecture:** GitHub Actions + GitHub Pages + static `digest.json`
- **No backend, no database, no LLM, no X/Twitter**
- **Stale data indicator:** popup shows "last updated X hours ago" using `generated_at`
- **Source labels + type badges in UI**
- **No settings UI, no user accounts, no notifications (badge only)**
- **MV3 service worker:** badge updates on popup open, not persistent background timer (service workers can be terminated)

---

## Sources (Locked for v1)

| Priority | Source | Feed | Type | Status |
|----------|--------|------|------|--------|
| 1 | Claude Code GitHub releases | `github.com/anthropics/claude-code/releases.atom` | Atom feed | **CONFIRMED VALID** — daily releases (v2.1.71 as of 2026-03-07) |
| 2 | Anthropic Developer Platform changelog | `platform.claude.com/docs/en/release-notes/overview` | HTML scrape | **IN** — no RSS, but structured `### Date` headers, stable, high-signal |
| Deferred | Anthropic blog/news | `anthropic.com/news` | HTML scrape | **DEFERRED** — no RSS, noisy, requires keyword filtering, low dev-relevance ratio |

---

## digest.json Schema (Locked)

```json
{
  "version": 1,
  "generated_at": "2026-03-09T12:00:00Z",
  "item_count": 42,
  "items": [
    {
      "id": "abc12345",
      "title": "Claude Code v2.1.71",
      "url": "https://github.com/anthropics/claude-code/releases/tag/v2.1.71",
      "source": "github_releases",
      "source_label": "Claude Code",
      "type": "release",
      "published_at": "2026-03-07T00:12:46Z",
      "summary": "First 200 chars of release body, markdown stripped",
      "fetched_at": "2026-03-09T12:00:00Z"
    }
  ]
}
```

Field rules:
- `id`: first 8 chars of SHA-1 of URL
- `source`: enum — `github_releases` | `anthropic_changelog`
- `type`: enum — `release` | `changelog`
- `summary`: optional, max 200 chars, markdown stripped, first sentence preferred
- `published_at`: ISO 8601 from feed/page, sort key
- `fetched_at`: when pipeline ran
- `is_read`: never in digest — lives in `chrome.storage.local` on client
- `version: 2` check in extension: show "please update extension" if unknown version

---

## Extension Behavior (Locked)

- On popup open: if `cached_at > 60 min`, fetch new `digest.json`
- Store items + `cached_at` in `chrome.storage.local`
- Track seen item IDs in `chrome.storage.local`
- Badge = count of unseen items
- Popup: flat list, newest first, source label, relative time ("2 days ago"), click opens URL
- "Mark all read" button
- Footer: "Last updated X hours ago" using `generated_at`
- If `generated_at` > 12 hours old: show warning "data may be stale"

---

## Build Order

1. **Data pipeline** — fetch + normalize + deduplicate + write `digest.json` (Node.js script)
2. **Validate pipeline** — run manually, inspect output, check item volume
3. **GitHub Action** — schedule pipeline every 4 hours, publish to GitHub Pages
4. **Extension popup** — read `digest.json`, render list, cache logic
5. **Badge logic** — MV3 service worker, update on popup open
6. **Polish** — relative timestamps, stale data warning, source label colors

---

## Folder Structure (Planned)

```
claude-signal/
├── CLAUDE.md
├── .github/
│   └── workflows/
│       └── update-digest.yml
├── scripts/
│   ├── fetch.js          # fetch + parse both sources
│   ├── normalize.js      # common schema, dedup, sort
│   └── generate.js       # entry point, writes digest.json
├── digest.json           # published artifact (GitHub Pages)
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── background.js     # MV3 service worker
│   └── styles.css
└── package.json
```

---

## Key Risks

- **Changelog scraper fragility:** `platform.claude.com/docs/en/release-notes/overview` has no RSS. If Anthropic redesigns the page, scraper breaks silently. Mitigation: log item count per run; alert (or fail the action) if 0 items returned.
- **GitHub releases titles are just version numbers:** (`v2.1.71`) — meaningful content is in the release body. Must fetch/parse body for summary. Atom feed includes body content.
- **Stale digest.json:** GitHub Actions can fail silently. Extension must check `generated_at` and warn if >12 hours old.
- **GitHub Pages propagation delay:** up to 10 min after commit. Acceptable.
- **Open-sourceable from day 1:** No hardcoded secrets. Use GitHub Actions secrets for any tokens. Include `.env.example`.

---

## Session Log

### 2026-03-09 — Session 1
- Full planning discussion completed
- Evaluated product direction, MVP scope, architecture, sources
- Ran source audit: confirmed GitHub releases feed valid (daily), changelog scrapeable (high signal), blog deferred (no RSS, noisy)
- Locked all architecture decisions (see above)
- Next: build data pipeline scripts

---

## Next Session Priority

**Build the data pipeline first. Start here:**

```bash
cd /Users/medhul/Desktop/projects/claude-signal
npm init -y
npm install node-fetch fast-xml-parser cheerio crypto
node scripts/generate.js
```

Before running: create `scripts/generate.js`, `scripts/fetch.js`, `scripts/normalize.js`.
Inspect `digest.json` output manually. Verify item count > 0 for both sources.
