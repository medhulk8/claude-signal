/**
 * Normalization pipeline: dedup → sort → retain.
 */

const RETAIN_COUNT = 90;

/**
 * Remove duplicate items by id.
 * First occurrence wins (preserve order before calling).
 */
export function dedup(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Sort by published_at descending (newest first).
 * Items with null published_at are sorted to the end.
 */
export function sortByDate(items) {
  return [...items].sort((a, b) => {
    if (!a.published_at) return 1;
    if (!b.published_at) return -1;
    return new Date(b.published_at) - new Date(a.published_at);
  });
}

/**
 * Keep the most recent N items.
 */
export function retain(items, max = RETAIN_COUNT) {
  return items.slice(0, max);
}

/**
 * Full pipeline: combine → dedup → sort → retain.
 */
export function normalize(...sourceLists) {
  const all = sourceLists.flat();
  return retain(dedup(sortByDate(all)));
}
