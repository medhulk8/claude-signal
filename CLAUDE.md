# claude-signal

## Current Status
**Phase: v1 complete and live.**

- Pipeline running on GitHub Actions every 4h
- Extension loaded unpacked in Chrome, rendering correctly
- GitHub Pages serving `https://medhulk8.github.io/claude-signal/digest.json`
- Repo: `https://github.com/medhulk8/claude-signal`

---

## Locked Architecture Decisions

Do not re-litigate these.

- **Extension type:** Chrome MV3, unpacked (personal use first, open-sourceable later)
- **Architecture:** GitHub Actions + GitHub Pages + static `digest.json`
- **No backend, no database, no LLM, no X/Twitter**
- **Stale data indicator:** popup shows "last updated X hours ago" using `generated_at`
- **Source labels + type badges in UI**
- **No settings UI, no user accounts, no notifications (badge only)**
- **MV3 service worker:** badge updates on popup open + on startup from cache

---

## Sources (Locked for v1)

| Priority | Source | Feed | Type | Status |
|----------|--------|------|------|--------|
| 1 | Claude Code GitHub releases | `github.com/anthropics/claude-code/releases.atom` | Atom feed | Live, daily releases |
| 2 | Anthropic Developer Platform changelog | `platform.claude.com/docs/en/release-notes/overview` | HTML scrape | Live, 134 items |
| Deferred | Anthropic blog/news | `anthropic.com/news` | HTML scrape | No RSS, noisy, skip for now |

---

## digest.json Schema (Locked)

```json
{
  "version": 1,
  "generated_at": "ISO 8601",
  "item_count": 60,
  "items": [{
    "id": "8-char sha1 of url",
    "title": "string",
    "url": "string",
    "source": "github_releases | anthropic_changelog",
    "source_label": "Claude Code | Anthropic Changelog",
    "type": "release | changelog",
    "published_at": "ISO 8601",
    "summary": "string | null (max 200 chars, markdown stripped)",
    "fetched_at": "ISO 8601"
  }]
}
```

- `is_read` lives in `chrome.storage.local`, never in digest
- GitHub empty release bodies ("No content.") → `summary: null`
- Changelog bullet IDs: `sha1(sectionUrl + '::' + rawText[:100])`

---

## chrome.storage.local shape

```json
{
  "cachedDigest": { "...": "..." },
  "seenIds": { "abc12345": true },
  "lastFetchedAt": "ISO 8601"
}
```

---

## Key Risks

- **Changelog scraper fragility:** hard-fails on 0 items so it never overwrites a healthy digest
- **Digest conflict with Actions:** if you run `npm run generate` locally while Action also ran, `git pull` before pushing
- **AGENTS.md:** created by Codex reviewer, gitignored, do not commit

---

## Session Log

### 2026-03-09 — Session 1
- Full planning + source audit completed
- Built pipeline (fetch.js, normalize.js, generate.js), GitHub Action, full MV3 extension
- Confirmed live: 10 GitHub releases + 134 changelog items → 60 normalized items
- Extension screenshot confirmed working in Chrome
- Fixed: empty GitHub release bodies suppressed ("No content." → null summary)
- AGENTS.md added to .gitignore (Codex reviewer file, keep locally)

---

## Next Session Priority

**Reload the extension after any popup.js/styles.css changes:**
```
chrome://extensions → Claude Signal → reload icon (↺)
```

**To regenerate digest manually:**
```bash
npm run generate && git add digest.json && git commit -m "Manual digest update" && git push
```

**Watch for:** changelog scraper breaking silently if Anthropic redesigns the docs page.
Check Action run history at: `https://github.com/medhulk8/claude-signal/actions`
