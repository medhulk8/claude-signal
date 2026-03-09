/**
 * Generates plain-English explanations for digest items using Groq.
 *
 * Only called for items that are new (not already in the published digest).
 * Each item gets { what, why } added to its explanation field.
 * Failures are non-fatal — item passes through without explanation.
 */

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function explainItem(item) {
  const sourceLabel =
    item.source === 'github_releases' ? 'Claude Code' : 'Anthropic API / developer platform';

  const context =
    item.summary && item.summary !== item.title ? `\nContext: ${item.summary}` : '';

  const prompt = `You are a technical writer helping developers understand updates to Claude and the Anthropic platform.

Item: "${item.title}"
Source: ${sourceLabel}${context}

Write a short explanation with two parts:
- what: 1-2 sentences explaining what this feature/change is in plain English.
- why: 1-2 sentences on why a ${sourceLabel} user or developer should care.

Be concrete and specific. Avoid marketing language. If details are uncertain, say so briefly.

Respond in this exact JSON format with no other text:
{"what": "...", "why": "..."}`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const text = response.choices[0].message.content.trim();

  // Model sometimes wraps in markdown code blocks — strip them
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

// 2s between requests → ~30 RPM, safely within Groq free tier limit
const RATE_LIMIT_DELAY_MS = 2000;

export async function addExplanations(items) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    try {
      const explanation = await explainItem(item);
      results.push({ ...item, explanation });
      console.log(`  ✓ Explained ${item.id}: ${item.title.slice(0, 60)}`);
    } catch (err) {
      console.error(`  ✗ Explanation failed for ${item.id}: ${err.message}`);
      // Non-fatal — item still gets published, detail page handles missing explanation
      results.push(item);
    }
  }
  return results;
}
