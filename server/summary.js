import { db } from './db.js';
import { findKBEntry } from './kb.js';

// Plain-language summaries of OUT-OF-RANGE values.
// Safety model (per client brief):
//  - flags come from rules, never from the summary engine
//  - summaries use locked templates built from the curated KB (30 common tests)
//  - critical values get NO summary - they create a staff callback task instead
//  - unknown tests (no KB entry) get NO summary - we say we are unsure
//  - patients can flag any summary; flagged summaries go to staff review
// If OPENROUTER_API_KEY / GROQ_API_KEY is set, an LLM rephrases the locked
// template text with the same facts; any LLM failure falls back to templates.

const DISCLAIMER = {
  en: 'This is a simple explanation, not medical advice. Please see your full report and consult your doctor.',
  te: 'ఇది కేవలం సరళమైన వివరణ మాత్రమే, వైద్య సలహా కాదు. దయచేసి మీ పూర్తి నివేదిక చూసి మీ డాక్టర్‌ను సంప్రదించండి.',
  hi: 'यह केवल एक सरल व्याख्या है, चिकित्सा सलाह नहीं। कृपया अपनी पूरी रिपोर्ट देखें और अपने डॉक्टर से परामर्श करें।',
};

export function buildSummaryTexts(result) {
  const entry = findKBEntry(result.parameter);
  if (!entry) return null; // unsure: no summary for unknown tests
  if (result.flag === 'critical' || result.flag === 'normal' || result.flag === 'unknown') return null;
  const t = result.flag === 'low' ? entry.low : entry.high;
  return {
    lang_en: `${t.en} (Your value: ${result.value} ${result.unit || ''}; normal: ${result.reference_range || '-'} ${result.unit || ''}) ${DISCLAIMER.en}`,
    lang_te: `${t.te} (మీ విలువ: ${result.value} ${result.unit || ''}; సాధారణం: ${result.reference_range || '-'} ${result.unit || ''}) ${DISCLAIMER.te}`,
    lang_hi: `${t.hi} (आपका मान: ${result.value} ${result.unit || ''}; सामान्य: ${result.reference_range || '-'} ${result.unit || ''}) ${DISCLAIMER.hi}`,
  };
}

export function generateSummariesForOrder(orderId) {
  const results = db.prepare('SELECT * FROM results WHERE order_id = ?').all(orderId);
  const ins = db.prepare(`INSERT INTO summaries (result_id, lang_en, lang_te, lang_hi, engine, confidence)
    VALUES (?,?,?,?,?,?) ON CONFLICT(result_id) DO NOTHING`);
  let created = 0;
  for (const r of results) {
    const texts = buildSummaryTexts(r);
    if (!texts) continue;
    ins.run(r.id, texts.lang_en, texts.lang_te, texts.lang_hi, 'template', 'high');
    created++;
  }
  return created;
}
