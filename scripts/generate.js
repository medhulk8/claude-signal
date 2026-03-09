/**
 * Entry point for the digest generation pipeline.
 * Run with: node scripts/generate.js
 *
 * Fetches both sources, normalizes, generates explanations for new items only
 * (idempotent — items already in digest.json keep their existing explanation),
 * validates, writes digest.json.
 * Exits with code 1 on any failure to prevent publishing a broken digest.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchGithubReleases, fetchChangelog } from './fetch.js';
import { normalize } from './normalize.js';
import { addExplanations } from './explain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'digest.json');

async function generate() {
  const generatedAt = new Date().toISOString();

  // --- Load existing digest for idempotency ---
  // Items already published keep their explanation; only new items call the API.
  let existingById = {};
  try {
    const existing = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
    for (const item of existing.items ?? []) {
      existingById[item.id] = item;
    }
    console.log(`Loaded ${Object.keys(existingById).length} existing items for idempotency`);
  } catch {
    console.log('No existing digest — all items are new');
  }

  // --- Fetch sources ---
  console.log('Fetching GitHub releases...');
  let releases = [];
  try {
    releases = await fetchGithubReleases();
    console.log(`  ✓ ${releases.length} releases`);
  } catch (err) {
    console.error(`  ✗ GitHub releases failed: ${err.message}`);
  }

  console.log('Fetching Anthropic changelog...');
  let changelog = [];
  try {
    changelog = await fetchChangelog();
    console.log(`  ✓ ${changelog.length} changelog items`);
  } catch (err) {
    console.error(`  ✗ Changelog failed: ${err.message}`);
    process.exit(1);
  }

  if (releases.length === 0 && changelog.length === 0) {
    console.error('Both sources returned 0 items. Aborting.');
    process.exit(1);
  }

  // --- Normalize ---
  const items = normalize(releases, changelog);
  console.log(`Normalized to ${items.length} items (after dedup + sort + retain)`);

  // --- Explain new items only ---
  const newItems = items.filter((item) => !existingById[item.id]);
  console.log(`${newItems.length} new items, ${items.length - newItems.length} carried over`);

  let explainedNew = newItems;
  if (newItems.length > 0) {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not set — skipping explanations');
    } else {
      console.log('Generating explanations...');
      explainedNew = await addExplanations(newItems);
    }
  }

  // --- Merge: carried-over items use existing (explanation-enriched) version ---
  const enrichedById = {};
  for (const item of explainedNew) {
    enrichedById[item.id] = item;
  }
  for (const item of items) {
    if (!enrichedById[item.id] && existingById[item.id]) {
      enrichedById[item.id] = existingById[item.id];
    }
  }
  const enrichedItems = items.map((item) => enrichedById[item.id] ?? item);

  // --- Build digest ---
  const digest = {
    version: 1,
    generated_at: generatedAt,
    item_count: enrichedItems.length,
    items: enrichedItems,
  };

  // --- Validate ---
  validate(digest);
  console.log('Validation passed.');

  // --- Write ---
  writeFileSync(OUT_PATH, JSON.stringify(digest, null, 2));
  console.log(`Written → ${OUT_PATH}`);
}

function validate(digest) {
  if (digest.version !== 1) throw new Error('Invalid version');
  if (!digest.generated_at) throw new Error('Missing generated_at');
  if (digest.item_count !== digest.items.length) {
    throw new Error(
      `item_count (${digest.item_count}) does not match items.length (${digest.items.length})`
    );
  }

  const REQUIRED = ['id', 'title', 'url', 'source', 'type', 'published_at'];
  const VALID_SOURCES = ['github_releases', 'anthropic_changelog'];
  const VALID_TYPES = ['release', 'changelog'];

  for (const item of digest.items) {
    for (const field of REQUIRED) {
      if (!item[field]) throw new Error(`Item missing "${field}": ${JSON.stringify(item)}`);
    }
    if (!VALID_SOURCES.includes(item.source)) {
      throw new Error(`Unknown source "${item.source}" on item ${item.id}`);
    }
    if (!VALID_TYPES.includes(item.type)) {
      throw new Error(`Unknown type "${item.type}" on item ${item.id}`);
    }
    if (isNaN(new Date(item.published_at).getTime())) {
      throw new Error(`Invalid published_at "${item.published_at}" on item ${item.id}`);
    }
  }
}

generate().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
