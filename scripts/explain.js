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

  // For changelog items, summary contains the full bullet text — richer than title alone.
  // For release items, summary is just the version number — not useful as raw_text.
  const rawText =
    item.source === 'anthropic_changelog' && item.summary && item.summary !== item.title
      ? item.summary
      : item.title;

  const summaryLine =
    item.summary && item.summary !== item.title && item.source === 'github_releases'
      ? `\nSummary: ${item.summary}`
      : '';

  return `You are generating a short, practical explainer for a technically literate Claude Code user.

Your job is to explain a single update item in a way that is:
- concrete
- useful
- grounded in the source text
- free of generic filler

You must return valid JSON only.

## Output schema

{
  "what_it_is": "string",
  "why_it_matters": "string",
  "how_to_use": ["string", "string"]
}

## Writing rules

1. Write for someone who already knows what Claude Code is.
2. Be specific. Do not use vague filler like:
   - "improves productivity"
   - "enhances user experience"
   - "useful for users"
   - "helps automate tasks"
   unless you immediately explain exactly how.
3. Do not simply restate the title or source text in slightly different words.
4. "what_it_is" should explain the actual capability in plain English.
5. "why_it_matters" should explain what changes in practice for a Claude Code user.
6. "how_to_use" should contain 1 to 3 realistic usage examples.
7. Only include examples that are reasonably supported by the source text.
8. If the source text is too thin to support multiple examples, return fewer examples.
9. Do not invent product behavior that is not supported by the input.
10. Keep it concise:
   - what_it_is: 1 to 2 sentences
   - why_it_matters: 1 to 2 sentences
   - how_to_use: 1 to 3 short bullet-style strings

## Style rules

- Sound like a technical explainer, not marketing copy.
- Prefer concrete workflow implications over abstract benefits.
- If the feature is minor, say what changed plainly without overselling it.
- If the update is a command, explain what the command enables.
- If the update is a platform-specific feature, mention the platform.
- If the update is a breaking change or deprecation, make that clear.

## Inputs

Title: ${item.title}
Source: ${sourceLabel}
Type: ${item.type}${summaryLine}
Original text: ${rawText}

## Return format

Return JSON only.
No markdown.
No explanation outside JSON.`;
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
