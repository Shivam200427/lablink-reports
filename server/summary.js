import { db } from './db.js';
import { findKBEntry } from './kb.js';
import { isAIEnabled, generateAISummary, validateAISummary } from './ai.js';

// Plain-language summaries of OUT-OF-RANGE values.
// Safety model (per client brief):
//  - flags come from rules (server/flags.js), never from the summary engine
//  - critical values get NO summary - they create a staff callback task instead
//  - unknown tests (no KB entry) get NO summary - we stay silent when unsure
//  - when AI_API_KEY is set, an LLM writes the sentence from a locked prompt;
//    the output must pass validateAISummary (quotes the exact value, short,
//    no advice/diagnosis) or the locked template below is used instead
//  - without a provider key the demo runs free on the locked templates
//  - the "not medical advice" disclaimer is shown once per report in the UI,
//    not repeated inside every summary
//  - patients can flag any summary; flagged summaries go to staff review

const PATTERN = {
  low: {
    en: (p) => `Your ${p} is below the normal range.`,
    te: (p) => `మీ ${p} సాధారణ పరిధి కంటే తక్కువగా ఉంది.`,
    hi: (p) => `आपका ${p} सामान्य सीमा से कम है।`,
  },
  high: {
    en: (p) => `Your ${p} is above the normal range.`,
    te: (p) => `మీ ${p} సాధారణ పరిధి కంటే ఎక్కువగా ఉంది.`,
    hi: (p) => `आपका ${p} सामान्य सीमा से अधिक है।`,
  },
};
const FACT = {
  en: (r) => `(Your value: ${r.value} ${r.unit || ''}; normal: ${r.reference_range || '-'} ${r.unit || ''})`,
  te: (r) => `(మీ విలువ: ${r.value} ${r.unit || ''}; సాధారణం: ${r.reference_range || '-'} ${r.unit || ''})`,
  hi: (r) => `(आपका मान: ${r.value} ${r.unit || ''}; सामान्य: ${r.reference_range || '-'} ${r.unit || ''})`,
};

// Locked template floor. Sync and dependency-free; always safe to show.
export function buildSummaryTexts(result) {
  const entry = findKBEntry(result.parameter);
  if (!entry) return null; // unsure: no summary for unknown tests
  if (result.flag !== 'low' && result.flag !== 'high') return null; // critical/normal/unknown: no summary
  const p = result.parameter;
  return {
    lang_en: `${PATTERN[result.flag].en(p)} ${FACT.en(result)}`,
    lang_te: `${PATTERN[result.flag].te(p)} ${FACT.te(result)}`,
    lang_hi: `${PATTERN[result.flag].hi(p)} ${FACT.hi(result)}`,
    engine: 'template',
  };
}

// AI-first path with per-language template fallback.
export async function buildSummaryTextsWithAI(result) {
  const base = buildSummaryTexts(result);
  if (!base || !isAIEnabled()) return base;
  const out = { ...base };
  const settled = await Promise.all(['en', 'te', 'hi'].map(async (lang) => {
    try {
      const text = await generateAISummary({
        parameter: result.parameter, value: result.value, unit: result.unit,
        referenceRange: result.reference_range, flag: result.flag, lang,
      });
      if (text && validateAISummary(text, result)) return [lang, text.trim()];
    } catch (e) {
      // Diagnosable but privacy-safe: test name + provider error only, never
      // patient identity or result values. Template stays the floor.
      console.warn(`AI summary fallback (${result.parameter}, ${lang}): ${e.message}`);
    }
    return null;
  }));
  let aiUsed = 0;
  for (const hit of settled) if (hit) { out[`lang_${hit[0]}`] = hit[1]; aiUsed++; }
  out.engine = aiUsed === 3 ? 'ai' : aiUsed > 0 ? 'ai+template' : 'template';
  return out;
}

export async function generateSummariesForOrder(orderId) {
  const results = db.prepare('SELECT * FROM results WHERE order_id = ?').all(orderId);
  const ins = db.prepare(`INSERT INTO summaries (result_id, lang_en, lang_te, lang_hi, engine, confidence)
    VALUES (?,?,?,?,?,?) ON CONFLICT(result_id) DO NOTHING`);
  let created = 0;
  // Sequential with a pause: polite to free providers, and any failure falls
  // back to the locked template for that language (never a burst of retries).
  // Order-level AI budget: after 25s of trying, the rest of the order goes
  // straight to templates so a sick provider can never stall a sign-off.
  const aiBudgetUntil = Date.now() + 25000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const r of results) {
    const texts = isAIEnabled() && Date.now() > aiBudgetUntil
      ? buildSummaryTexts(r)
      : await buildSummaryTextsWithAI(r);
    if (!texts) continue;
    ins.run(r.id, texts.lang_en, texts.lang_te, texts.lang_hi, texts.engine, texts.engine === 'template' ? 'high' : 'low');
    created++;
    if (isAIEnabled()) await sleep(1200);
  }
  return created;
}
