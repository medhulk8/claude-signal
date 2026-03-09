# Claude Signal

**High-signal updates from Claude Code and the Anthropic developer platform — delivered as a browser extension.**

No accounts. No newsletters. Just the updates that actually matter, explained in plain English.

---

## What you get

- New Claude Code features, breaking changes, and deprecations — extracted from release notes
- Anthropic developer platform updates — filtered to meaningful changes only
- A plain-English explainer for each item: what it is, why it matters, how to use it
- Unread badge on your browser toolbar
- Click any item to read the full explanation

Noise like "Fixed a bug" or "Improved performance" is filtered out automatically.

---

## Install

> No Chrome Web Store listing yet — takes about 30 seconds to load manually.

1. **Download the repo**

   ```
   git clone https://github.com/medhulk8/claude-signal.git
   ```
   Or download as a ZIP from the green **Code** button → **Download ZIP**, then unzip it.

2. **Open Chrome extensions**

   Go to `chrome://extensions` in your browser.

3. **Enable Developer mode**

   Toggle it on in the top-right corner.

4. **Load the extension**

   Click **Load unpacked** → select the `extension/` folder inside the repo.

That's it. The extension is now installed and will fetch updates automatically.

---

## How it works

A scheduled pipeline runs every hour on GitHub Actions. It fetches the latest Claude Code releases and Anthropic changelog entries, filters for signal, generates explanations using an LLM, and publishes a `digest.json` file to GitHub Pages.

The extension fetches that file — no backend, no account, no tracking.

---

## Want your own feed or custom version?

Fork the repo and follow the steps in [SELF_HOSTING.md](SELF_HOSTING.md).
