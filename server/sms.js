import { get, logAccess, run } from './db.js';

// Real SMS delivery via Fast2SMS Quick SMS API (route=q), enabled only when
// FAST2SMS_API_KEY is set. Without a key, or for any recipient other than the
// explicitly allowed demo number, messages stay in the mocked outbox so no
// credit can be spent unintentionally. Provider acceptance is recorded
// honestly: a provider-sent row is marked 'sent' (accepted by the provider),
// never auto-promoted to 'delivered'.
const API_URL = 'https://www.fast2sms.com/dev/bulkV2';

let fetchImpl = (...args) => globalThis.fetch(...args);
export function _setFetchForTests(f) { fetchImpl = f; }

export function smsConfig() {
  const key = process.env.FAST2SMS_API_KEY || '';
  const allowed = (process.env.FAST2SMS_ALLOWED_RECIPIENT || '').replace(/\D/g, '');
  const totalBudget = parseInt(process.env.FAST2SMS_TOTAL_BUDGET || '0', 10);
  return { enabled: !!key, key, allowed, totalBudget };
}

const digits10 = (m) => (m || '').replace(/\D/g, '').slice(-10);

export async function sendRealSms({ toMobile, body }) {
  const cfg = smsConfig();
  if (!cfg.enabled) return { attempted: false, reason: 'no_api_key' };
  const to = digits10(toMobile);
  if (!cfg.allowed || to !== digits10(cfg.allowed)) {
    await logAccess('system', null, 'sms_blocked_recipient', 'outbox', null, `real SMS blocked for ${toMobile} (not the allowed demo recipient)`);
    return { attempted: false, reason: 'recipient_not_allowed' };
  }
  // Durable TOTAL budget (default 0 = no real sends). The claim is a single
  // atomic INSERT...SELECT, consumed before the provider call and never
  // released - one approved attempt means exactly one attempt, failure or not.
  const claim = await run(
    'INSERT INTO sms_real_claims (to_mobile, kind) SELECT ?, ? WHERE (SELECT COUNT(*) FROM sms_real_claims) < ?'
  , [to, 'otp', cfg.totalBudget]);
  if (!claim.changes) {
    await logAccess('system', null, 'sms_blocked_cap', 'outbox', null, `real SMS total budget (${cfg.totalBudget}) exhausted`);
    return { attempted: false, reason: 'budget_exhausted' };
  }
  const url = `${API_URL}?authorization=${encodeURIComponent(cfg.key)}&route=q&message=${encodeURIComponent(body)}&numbers=${encodeURIComponent(to)}&flash=0`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    if (data && data.return === true) {
      await logAccess('system', null, 'sms_provider_accepted', 'outbox', null, `fast2sms accepted message to ${to} (request_id=${data.request_id ?? 'n/a'})`);
      await run(`UPDATE sms_real_claims SET result=? WHERE id=(SELECT MAX(id) FROM sms_real_claims)`, [`accepted request_id=${data.request_id ?? 'n/a'}`]);
      return { attempted: true, ok: true, providerStatus: `accepted request_id=${data.request_id ?? 'n/a'}` };
    }
    const msg = data && data.message != null
      ? (Array.isArray(data.message) ? data.message.join(', ') : String(data.message))
      : `http_${res.status}`;
    await logAccess('system', null, 'sms_provider_rejected', 'outbox', null, `fast2sms rejected message to ${to}: ${msg}`.slice(0, 300));
    await run(`UPDATE sms_real_claims SET result=? WHERE id=(SELECT MAX(id) FROM sms_real_claims)`, [`rejected: ${msg}`.slice(0, 300)]);
    return { attempted: true, ok: false, providerStatus: `rejected: ${msg}`.slice(0, 300) };
  } catch (e) {
    await logAccess('system', null, 'sms_provider_error', 'outbox', null, `fast2sms call failed: ${e.message}`.slice(0, 300));
    await run(`UPDATE sms_real_claims SET result=? WHERE id=(SELECT MAX(id) FROM sms_real_claims)`, [`error: ${e.message}`.slice(0, 300)]);
    return { attempted: true, ok: false, providerStatus: `error: ${e.message}`.slice(0, 300) };
  }
}
