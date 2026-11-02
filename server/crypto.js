import crypto from 'node:crypto';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomOTP = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const SALT = process.env.PASSWORD_SALT || 'lablink-dev-salt';
export function hashPassword(pw) {
  return crypto.scryptSync(String(pw), SALT, 32).toString('hex');
}
export function verifyPassword(pw, hash) {
  const a = crypto.scryptSync(String(pw), SALT, 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function addHours(h) {
  return new Date(Date.now() + h * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
export function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
