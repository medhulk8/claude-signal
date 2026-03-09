# claude-signal

## Current Status
**Phase: v2 in progress — detail page with on-demand LLM explanations.**

- Pipeline running on GitHub Actions every 1h (fetch + normalize only, no LLM)
- Extension loaded unpacked in Chrome
- GitHub Pages serving `https://medhulk8.github.io/claude-signal/digest.json`
- Repo: `https://github.com/medhulk8/claude-signal`
- Groq API key stored in `chrome.storage.local` under `groqApiKey` (set once by user)

---

## Locked Architecture Decisions

Do not re-litigate these.

- **Extension type:** Chrome MV3, unpacked (personal use first, open-sourceable later)
- **Architecture:** GitHub Actions + GitHub Pages + static `digest.json`
- **No backend, no database, no X/Twitter**
- **LLM (Groq):** client-side only, called on-demand when user clicks an item. Never in the pipeline.
- **Stale data indicator:** popup shows "last updated X hours ago" using `generated_at`
- **Source labels + type badges in UI**
- **No settings UI, no user accounts, no notifications (badge only)**
- **MV3 service worker:** badge updates on popup open + on startup from cache

---

## Sources (Locked for v1)

| Priority | Source | Feed | Type | Status |
|----------|--------|------|------|--------|
| 1 | Claude Code GitHub releases | `github.com/anthropics/claude-code/releases.atom` | Atom feed | Live, daily releases |
| 2 | Anthropic Developer Platform changelog | `platform.claude.com/docs/en/release-notes/overview` | HTML scrape | Live |
| Deferred | Anthropic blog/news | `anthropic.com/news` | HTML scrape | No RSS, noisy, skip for now |

---

## Signal Filtering

### GitHub releases (`isSignalBullet`)
Whitelist approach — keep only:
- `"Added X"` or `"[Platform] Added X"` bullets
- Deprecations / breaking changes
- Exclude: `"auto-approval allowlist"` bullets (unix tool names, not user-facing)
- Everything else (Fixed, Improved, Reduced, etc.) dropped

### Anthropic changelog (`isChangelogSignal`)
Blacklist approach (changelog is already curated) — drop:
- Bullets starting with `Fixed` / `Resolved`
- Bullets starting with `Improved` / `Updated` / `Reduced` / `Enhanced`
- Keep everything else

---

## digest.json Schema (Locked)

```json
{
  "version": 1,
  "generated_at": "ISO 8601",
  "item_count": 90,
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

- No `explanation` field in digest.json — explanations are generated client-side and cached in `chrome.storage.local`
- `is_read` lives in `chrome.storage.local`, never in digest
- Changelog bullet IDs: `sha1(sectionUrl + '::' + rawText[:100])`

---

## chrome.storage.local shape

```json
{
  "cachedDigest":  { "...": "..." },
  "seenIds":       { "abc12345": true },
  "lastFetchedAt": "ISO 8601",
  "groqApiKey":    "gsk_...",
  "explanations":  { "abc12345": { "what": "...", "why": "..." } }
}
```

---

## Detail Page Flow

1. User clicks item in popup → opens `detail.html?id=X` in new tab
2. detail.js reads item from `cachedDigest`
3. Checks `explanations[id]` in storage → if cached, renders immediately
4. If no key set → shows inline API key input form
5. If key set but no explanation → calls Groq API (`llama-3.3-70b-versatile`), caches result, renders
6. Also marks item as read on open

---

## Key Risks

- **Changelog scraper fragility:** hard-fails on 0 items so it never overwrites a healthy digest
- **Digest conflict with Actions:** if you run `npm run generate` locally while Action also ran, `git pull` before pushing
- **AGENTS.md:** created by Codex reviewer, gitignored, do not commit
- **Groq key:** stored in chrome.storage.local only, never committed to git

---

## Commit style
No `Co-Authored-By` lines. Keep messages concise.

---

## Session Log

### 2026-03-09 — Session 1
- Full planning + source audit completed
- Built pipeline (fetch.js, normalize.js, generate.js), GitHub Action, full MV3 extension
- Confirmed live: 10 GitHub releases + 134 changelog items → 60 normalized items
- Extension screenshot confirmed working in Chrome
- Fixed: empty GitHub release bodies suppressed ("No content." → null summary)
- AGENTS.md added to .gitignore (Codex reviewer file, keep locally)

### 2026-03-09 — Session 2
- Switched GitHub releases from one-item-per-release to bullet-level extraction (`isSignalBullet`)
- Added `isChangelogSignal` filter to Anthropic changelog (blacklist approach)
- Changed cron from 4h to 1h
- Retain count bumped from 60 → 90
- Added detail page (`detail.html`, `detail.js`, `detail.css`) with on-demand Groq explanations
- Groq API key stored client-side in chrome.storage.local, never in pipeline
- Popup items now open detail page instead of raw source URL
- Tried pipeline-based Gemini/Groq explanations — abandoned in favour of client-side on-demand

---

## Next Session Priority

**Reload the extension after any popup.js/styles.css/detail.js changes:**
```
chrome://extensions → Claude Signal → reload icon (↺)
```

**To regenerate digest manually:**
```bash
npm run generate && git add digest.json && git commit -m "Manual digest update" && git push
```

**Watch for:** changelog scraper breaking silently if Anthropic redesigns the docs page.
Check Action run history at: `https://github.com/medhulk8/claude-signal/actions`
