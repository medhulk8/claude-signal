/**
 * Fetchers for both sources.
 * Returns arrays of normalized digest items.
 * Throws on fetch failure or parse failure.
 * Hard-fails if 0 items returned from changelog (scraper likely broken).
 */

import { createHash } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

const GITHUB_RELEASES_URL = 'https://github.com/anthropics/claude-code/releases.atom';
const CHANGELOG_URL = 'https://platform.claude.com/docs/en/release-notes/overview';

// --- Helpers ---

export function makeId(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 8);
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    let s = u.toString();
    // Re-add hash if present (used for changelog anchors)
    if (url.includes('#')) {
      const hash = url.slice(url.indexOf('#'));
      s = s + hash;
    }
    return s.replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '');
  }
}

function stripHtml(html) {
  const $ = cheerio.load(html);
  return $.text().trim();
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function truncate(text, max = 200) {
  if (!text || text.length <= max) return text || null;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function slugFromText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// --- GitHub Releases ---

export async function fetchGithubReleases() {
  const res = await fetch(GITHUB_RELEASES_URL);
  if (!res.ok) throw new Error(`GitHub releases fetch failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'entry',
  });

  const parsed = parser.parse(xml);
  const entries = parsed?.feed?.entry ?? [];
  const now = new Date().toISOString();

  return entries
    .map((entry) => {
      // link can be an object with @_href or a string
      const rawUrl =
        typeof entry.link === 'string'
          ? entry.link
          : Array.isArray(entry.link)
          ? (entry.link.find((l) => l['@_rel'] === 'alternate') ?? entry.link[0])?.['@_href']
          : entry.link?.['@_href'] ?? '';

      const url = normalizeUrl(rawUrl);
      if (!url) return null;

      // Content is HTML (XML-decoded by fast-xml-parser)
      const rawContent =
        typeof entry.content === 'object'
          ? entry.content['#text'] ?? ''
          : entry.content ?? '';

      const bodyText = stripHtml(rawContent);

      return {
        id: makeId(url),
        title: String(entry.title ?? '').trim(),
        url,
        source: 'github_releases',
        source_label: 'Claude Code',
        type: 'release',
        published_at: entry.published ?? entry.updated ?? null,
        summary: truncate(bodyText),
        fetched_at: now,
      };
    })
    .filter((item) => item && item.url && item.title);
}

// --- Anthropic Developer Changelog ---

export async function fetchChangelog() {
  const res = await fetch(CHANGELOG_URL, {
    headers: { 'User-Agent': 'claude-signal/0.1 (personal feed aggregator)' },
  });
  if (!res.ok) throw new Error(`Changelog fetch failed: ${res.status}`);
  const html = await res.text();

  const $ = cheerio.load(html);
  const items = [];
  const now = new Date().toISOString();

  $('h3').each((_, el) => {
    const headingText = $(el).text().trim();

    // Parse date — expected format: "February 19, 2026" or "February 19th, 2025"
    const cleanedDate = headingText.replace(/(\d+)(st|nd|rd|th)/, '$1');
    const parsedDate = new Date(cleanedDate);
    if (isNaN(parsedDate.getTime())) return; // skip non-date h3s

    const published_at = parsedDate.toISOString();

    // Use existing id attribute if present, else construct slug
    const elId = $(el).attr('id');
    const anchor = elId ?? slugFromText(headingText);
    const sectionUrl = `${CHANGELOG_URL}#${anchor}`;

    // Walk siblings until next h3
    let sibling = $(el).next();
    while (sibling.length && !sibling.is('h3')) {
      if (sibling.is('ul, ol')) {
        sibling.find('> li').each((_, li) => {
          const rawText = $(li).text().trim();
          if (!rawText) return;

          const clean = stripMarkdown(rawText);
          // Title: first sentence or first 80 chars
          const firstSentence = clean.split(/\.\s+/)[0].replace(/\.$/, '').trim();
          const title = truncate(firstSentence, 80) ?? clean.slice(0, 80);
          const summary = truncate(clean);

          // ID includes title so bullets within the same date section are unique
          const id = makeId(sectionUrl + '::' + rawText.slice(0, 100));

          items.push({
            id,
            title,
            url: sectionUrl,
            source: 'anthropic_changelog',
            source_label: 'Anthropic Changelog',
            type: 'changelog',
            published_at,
            summary,
            fetched_at: now,
          });
        });
      }
      sibling = sibling.next();
    }
  });

  if (items.length === 0) {
    throw new Error(
      'Changelog scraper returned 0 items — page structure may have changed. Aborting to protect existing digest.'
    );
  }

  return items;
}
