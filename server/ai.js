// Real AI summary generation via an OpenAI-compatible chat API.
// Enabled only when AI_API_KEY is set - the demo runs free on locked templates.
//   AI_API_KEY   provider key (env only, never committed); not needed for
//                keyless free endpoints such as https://text.pollinations.ai/openai
//                (demo only - never send real patient data to a free endpoint)
//   AI_BASE_URL  default https://api.openai.com/v1
//   AI_MODEL     default gpt-4o-mini
// Every AI output is validated before it reaches a patient: it must quote the
// exact result value, stay short, and contain no advice/diagnosis/treatment.
// Anything that fails validation (or any provider error) falls back to the
// locked template for that language. Critical values never reach the AI at
// all - they create a staff callback task instead.

const LANG_NAME = { en: 'English', te: 'Telugu', hi: 'Hindi' };

let injectedClient = null; // tests inject a fake provider here
export function setAIClient(fn) { injectedClient = fn; }
export function isAIEnabled() { return !process.env.AI_OFF && (!!injectedClient || !!process.env.AI_API_KEY || !!process.env.AI_BASE_URL); }

async function defaultClient(messages) {
  const base = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini', messages, temperature: 0.2,
      // 400 tokens: Telugu/Hindi answers tokenise longer than English, and
      // some models (Gemini) count hidden reasoning against the budget.
      max_tokens: 400,
      // Optional provider hint (e.g. AI_REASONING_EFFORT=none for Gemini
      // free tier) - only sent when set, so OpenAI-style providers never
      // see an unknown field.
      ...(process.env.AI_REASONING_EFFORT ? { reasoning_effort: process.env.AI_REASONING_EFFORT } : {}),
    }),
    // Hard ceiling (default 10s, AI_TIMEOUT_MS override): a slow or
    // unreachable provider must never hang a sign-off or deploy startup.
    // Timeout -> locked template fallback.
    signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS) || 10000),
  });
  if (!res.ok) throw new Error(`AI provider HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// Advice / diagnosis / treatment wording is not allowed in patient summaries.
const BANNED = /\b(tablet|tablets|pill|pills|medicine|medicines|medication|dose|dosage|prescri\w+|diet|exercise|yoga|avoid|eat|drink|alcohol|smok\w+|surgery|treatment|remedy|cure|diagnos\w+|definitely|emergency)\b/i;

export function validateAISummary(text, result) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (clean.length < 10 || clean.length > 280) return false;
  if (!clean.includes(String(result.value))) return false; // must quote the actual value
  if (BANNED.test(clean)) return false;
  if (/critical/i.test(clean)) return false; // critical values are never summarised
  return true;
}

export async function generateAISummary({ parameter, value, unit, referenceRange, flag, lang }) {
  const call = injectedClient || defaultClient;
  const direction = flag === 'low' ? 'below' : 'above';
  const messages = [
    { role: 'system', content: `You write one short sentence in ${LANG_NAME[lang]} for an elderly patient about a lab result. Rules: say only that "${parameter}" is ${direction} the normal range; quote the value ${value} ${unit || ''} and the normal range ${referenceRange || '-'} ${unit || ''}; no medical advice, no diagnosis, no treatment, no diet or lifestyle tips; plain simple words; under 35 words.` },
    { role: 'user', content: `Test: ${parameter}. Value: ${value} ${unit || ''}. Normal range: ${referenceRange || '-'} ${unit || ''}. Flag: ${flag}. Write the sentence in ${LANG_NAME[lang]}.` },
  ];
  return call(messages);
}
