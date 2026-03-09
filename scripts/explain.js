/**
 * Generates plain-English explanations for digest items using Gemini.
 *
 * Only called for items that are new (not already in the published digest).
 * Each item gets { what, why } added to its explanation field.
 * Failures are non-fatal — item passes through without explanation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Model sometimes wraps in markdown code blocks — strip them
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

export async function addExplanations(items) {
  const results = [];
  for (const item of items) {
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
