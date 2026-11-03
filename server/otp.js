import { get, logAccess, run } from './db.js';
import { sha256, randomOTP, randomToken, addHours, now } from './crypto.js';
import { queueMessage } from './outbox.js';
import { sendRealSms } from './sms.js';

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export async function requestOTP(mobile, purpose = 'login') {
  // rate limit: max 3 live OTPs per mobile per 10 minutes
  const recent = (await get(
    `SELECT COUNT(*) c FROM otps WHERE mobile=? AND created_at > datetime('now','-10 minutes')`
  , [mobile])).c;
  if (recent >= 3) return { error: 'rate_limited' };
  const code = randomOTP();
  (await run('INSERT INTO otps (mobile, code_hash, purpose, expires_at) VALUES (?,?,?,?)', [mobile, sha256(code), purpose, new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString().replace('T',' ').slice(0,19)]));
  const body = `Your LabLink OTP is ${code}. Valid for ${OTP_TTL_MIN} minutes. Do not share it.`;
  const real = await sendRealSms({ toMobile: mobile, body });
  if (real.attempted) {
    // Provider row records the honest outcome: 'sent' = accepted by the
    // provider (never auto-promoted to 'delivered'); 'failed' = rejected/error.
    await queueMessage({ channel: 'sms', toMobile: mobile, body, kind: 'otp', provider: 'fast2sms', providerStatus: real.providerStatus, status: real.ok ? 'sent' : 'failed' });
    if (!real.ok) {
      // Safe fallback: a mocked copy keeps the demo flow readable in the outbox
      // when the provider call fails; it is never sent anywhere.
      await queueMessage({ channel: 'sms', toMobile: mobile, body, kind: 'otp' });
    }
  } else {
    await queueMessage({ channel: 'sms', toMobile: mobile, body, kind: 'otp' });
  }
  await logAccess('system', null, 'otp_requested', 'mobile', null, `${purpose} OTP sent to ${mobile}`);
  return { ok: true };
}

export async function verifyOTP(mobile, code, purpose = 'login', { consume = true } = {}) {
  const row = (await get(
    `SELECT * FROM otps WHERE mobile=? AND purpose=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`
  , [mobile, purpose]));
  if (!row) return { error: 'no_otp' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'too_many_attempts' };
  if (row.expires_at < now()) return { error: 'expired' };
  if (row.code_hash !== sha256(code)) {
    (await run('UPDATE otps SET attempts=attempts+1 WHERE id=?', [row.id]));
    return { error: 'wrong_code' };
  }
  if (consume) {
    const used = await run('UPDATE otps SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND attempts<? AND expires_at>=?', [now(), row.id, MAX_ATTEMPTS, now()]);
    if (Number(used.changes) !== 1) return { error: 'no_otp' };
  }
  return { ok: true };
}

export async function createSession(actorType, actorId, scope = null, hours = 12) {
  const token = randomToken();
  (await run('INSERT INTO sessions (token_hash, actor_type, actor_id, scope, expires_at) VALUES (?,?,?,?,?)', [sha256(token), actorType, actorId, scope, addHours(hours)]));
  return token;
}

export async function getSession(token) {
  if (!token) return null;
  const s = (await get('SELECT * FROM sessions WHERE token_hash=?', [sha256(token)]));
  if (!s || s.expires_at < now()) return null;
  return s;
}
