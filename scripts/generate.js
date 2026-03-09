/**
 * Entry point for the digest generation pipeline.
 * Run with: node scripts/generate.js
 *
 * Fetches both sources, normalizes, validates, writes digest.json.
 * Exits with code 1 on any failure to prevent publishing a broken digest.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchGithubReleases, fetchChangelog } from './fetch.js';
import { normalize } from './normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'digest.json');

async function generate() {
  const generatedAt = new Date().toISOString();

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

  // --- Build digest ---
  const digest = {
    version: 1,
    generated_at: generatedAt,
    item_count: items.length,
    items,
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
