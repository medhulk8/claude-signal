# Self-Hosting Claude Signal

If you want your own feed, your own pipeline, or a customized version — fork the repo and follow these steps.

---

## Prerequisites

- A GitHub account
- A free [Groq](https://console.groq.com) API key (for generating explanations)

---

## Step 1 — Fork the repo

Click **Fork** on the GitHub repo page. All future steps happen in your fork.

---

## Step 2 — Enable GitHub Pages

1. Go to your fork → **Settings → Pages**
2. Set source to **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Save

Your digest will be published at:
```
https://YOUR_USERNAME.github.io/claude-signal/digest.json
```

---

## Step 3 — Add your Groq API key

1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `GROQ_API_KEY`, value: your key from [console.groq.com](https://console.groq.com)

The pipeline uses `llama-3.3-70b-versatile` on Groq's free tier. No billing required.

---

## Step 4 — Point the extension at your digest

In `extension/popup.js`, update this line:

```js
const DIGEST_URL = 'https://YOUR_USERNAME.github.io/claude-signal/digest.json';
```

In `extension/manifest.json`, update `host_permissions`:

```json
"host_permissions": [
  "https://YOUR_USERNAME.github.io/*"
]
```

---

## Step 5 — Load the extension

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

---

## Step 6 — Trigger the first pipeline run

Push any commit or go to **Actions → Update digest → Run workflow**.

The pipeline runs automatically every hour after that.

---

## Generating the digest locally

```bash
npm install
GROQ_API_KEY=your_key npm run generate
```

This writes `digest.json` to the repo root. Commit and push to publish it.

---

## Notes

- The pipeline is idempotent — items that already have an explanation are never re-explained
- If the Groq key is missing, the pipeline still runs but skips explanation generation
- The pipeline exits with code 1 if both sources return 0 items, preventing a blank digest from being published
- Watch for changelog scraper breakage if Anthropic redesigns their docs page
