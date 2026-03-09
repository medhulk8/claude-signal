/**
 * Generates structured explanations for digest items using Groq.
 *
 * Only called for new items (not already in published digest).
 * Each item gets an { what_it_is, why_it_matters, how_to_use[] } explanation.
 * Failures are non-fatal — item publishes without explanation.
 */

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildPrompt(item) {
  const sourceLabel =
    item.source === 'github_releases' ? 'Claude Code' : 'Anthropic API / developer platform';
  const context =
    item.summary && item.summary !== item.title ? `\nAdditional context: ${item.summary}` : '';

  return `You are a technical explainer writing for software developers who actively use Claude Code or the Anthropic API.

Item: "${item.title}"
Source: ${sourceLabel}${context}

Explain this update for a technically literate Claude Code user. Return valid JSON only, no other text:
{
  "what_it_is": "1-2 sentences. What this feature or change actually does, in plain language. No hype.",
  "why_it_matters": "1-2 sentences. Specific practical value for a Claude Code or Anthropic API user. Avoid generic phrases like 'improves productivity' or 'saves time'.",
  "how_to_use": ["concrete example 1", "concrete example 2"]
}

Rules:
- Stay grounded in the item text. Do not invent capabilities not described.
- how_to_use: 1-3 items. Real, specific usage scenarios starting with an action verb. If you cannot form concrete examples from the available text, return 1 short example rather than hallucinating.
- No filler. No repetition of the title. No marketing language.`;
}

async function explainItem(item) {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: buildPrompt(item) }],
    temperature: 0.2,
  });

  const text = response.choices[0].message.content.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalise how_to_use — ensure it's always an array
  if (!Array.isArray(parsed.how_to_use)) {
    parsed.how_to_use = parsed.how_to_use ? [parsed.how_to_use] : [];
  }

  return parsed;
}

// 2s between requests → ~30 RPM, safely within Groq free tier
const DELAY_MS = 2000;

export async function addExplanations(items) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    const item = items[i];
    try {
      const explanation = await explainItem(item);
      results.push({ ...item, explanation });
      console.log(`  ✓ ${item.id}: ${item.title.slice(0, 60)}`);
    } catch (err) {
      console.error(`  ✗ ${item.id}: ${err.message}`);
      results.push(item);
    }
  }
  return results;
}
