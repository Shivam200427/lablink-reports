import { db, logAccess } from './db.js';
import { sha256, randomOTP, randomToken, addHours, now } from './crypto.js';
import { queueMessage } from './outbox.js';

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export function requestOTP(mobile, purpose = 'login') {
  // rate limit: max 3 live OTPs per mobile per 10 minutes
  const recent = db.prepare(
    `SELECT COUNT(*) c FROM otps WHERE mobile=? AND created_at > datetime('now','-10 minutes')`
  ).get(mobile).c;
  if (recent >= 3) return { error: 'rate_limited' };
  const code = randomOTP();
  db.prepare('INSERT INTO otps (mobile, code_hash, purpose, expires_at) VALUES (?,?,?,?)')
    .run(mobile, sha256(code), purpose, new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString().replace('T',' ').slice(0,19));
  queueMessage({ channel: 'sms', toMobile: mobile, body: `Your LabLink OTP is ${code}. Valid for ${OTP_TTL_MIN} minutes. Do not share it.`, kind: 'otp' });
  logAccess('system', null, 'otp_requested', 'mobile', null, `${purpose} OTP sent to ${mobile}`);
  return { ok: true };
}

export function verifyOTP(mobile, code, purpose = 'login', { consume = true } = {}) {
  const row = db.prepare(
    `SELECT * FROM otps WHERE mobile=? AND purpose=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`
  ).get(mobile, purpose);
  if (!row) return { error: 'no_otp' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'too_many_attempts' };
  if (row.expires_at < now()) return { error: 'expired' };
  if (row.code_hash !== sha256(code)) {
    db.prepare('UPDATE otps SET attempts=attempts+1 WHERE id=?').run(row.id);
    return { error: 'wrong_code' };
  }
  if (consume) db.prepare('UPDATE otps SET consumed_at=? WHERE id=?').run(now(), row.id);
  return { ok: true };
}

export function createSession(actorType, actorId, scope = null, hours = 12) {
  const token = randomToken();
  db.prepare('INSERT INTO sessions (token_hash, actor_type, actor_id, scope, expires_at) VALUES (?,?,?,?,?)')
    .run(sha256(token), actorType, actorId, scope, addHours(hours));
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(sha256(token));
  if (!s || s.expires_at < now()) return null;
  return s;
}
