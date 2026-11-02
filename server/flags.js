// Deterministic flagging of results against reference ranges.
// Flags come ONLY from these rules (never from the AI), per the client brief.

export function parseRange(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  let m = t.match(/^(-?\d+(?:\.\d+)?)\s*[-–to]+\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  m = t.match(/^(?:<|<=|up to|less than|below|upto)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return { low: null, high: parseFloat(m[1]) };
  m = t.match(/^(?:>|>=|above|more than|over)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return { low: parseFloat(m[1]), high: null };
  m = t.match(/^(-?\d+(?:\.\d+)?)$/);
  if (m) return { low: null, high: parseFloat(m[1]) };
  return null;
}

export function numericValue(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// kbEntry may carry criticalLow / criticalHigh thresholds.
export function flagResult(value, referenceRange, kbEntry) {
  const v = numericValue(value);
  const r = parseRange(referenceRange);
  if (v == null || !r) return 'unknown';
  if (kbEntry?.criticalLow != null && v < kbEntry.criticalLow) return 'critical';
  if (kbEntry?.criticalHigh != null && v > kbEntry.criticalHigh) return 'critical';
  if (r.low != null && v < r.low) return 'low';
  if (r.high != null && v > r.high) return 'high';
  return 'normal';
}
