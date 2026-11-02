import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { all, get, run, insert, initDB, logAccess } from './db.js';
import { requestOTP, verifyOTP, createSession, getSession } from './otp.js';
import { hashPassword, verifyPassword, now, randomToken, sha256, addHours } from './crypto.js';
import { importCSV, signOffOrder } from './lis.js';
import { flagResult } from './flags.js';
import { findKBEntry } from './kb.js';
import { tickOutbox, resendMessage, queueMessage } from './outbox.js';
import { generateSummariesForOrder } from './summary.js';
import { generateReportPDF } from './pdf.js';

await initDB();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
for (const m of ['get', 'post', 'put', 'delete']) {
  const orig = app[m].bind(app);
  app[m] = (p, ...hs) => orig(p, ...hs.map((h) => async (req, res, next) => {
    try { await h(req, res, next); } catch (e) { next(e); }
  }));
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const mask = (m) => (m && m.length >= 4 ? '*'.repeat(Math.max(0, m.length - 4)) + m.slice(-4) : '****');

async function actor(req) {
  const s = await getSession(req.cookies?.ll_session);
  if (!s) return null;
  return { type: s.actor_type, id: s.actor_id, scope: s.scope };
}
function requireRole(...types) {
  return async (req, res, next) => {
    const a = await actor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    if (!types.includes(a.type)) return res.status(403).json({ error: 'forbidden' });
    req.actor = a;
    next();
  };
}
const setSessionCookie = (res, token) =>
  res.cookie('ll_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- patient auth ----------
// Which patients a login mobile may see: exactly the patients with an ACTIVE
// GRANT for that mobile (patient_access). Holding the phone is never enough on
// its own - a grant exists only after OTP-verified self-registration ('self'),
// a staff contact attestation ('contact'), or a staff delegation ('delegated').
async function authorizedPatientIds(mobile) {
  const rows = (await all(
    `SELECT patient_id AS id FROM patient_access WHERE mobile=? AND revoked_at IS NULL`, [mobile]));
  return rows.map((r) => r.id);
}

// After a successful OTP, every self-registered record on this mobile holds a
// 'self' grant. The grant is created at verified possession, not at
// registration form submission, and only ever attaches to the account's OWN
// empty record - lab reports reach it only via staff identity attestation.
async function ensureSelfGrants(mobile) {
  const selfRows = (await all("SELECT id FROM patients WHERE mobile=? AND created_via='self' AND merged_into IS NULL", [mobile]));
  for (const p of selfRows) {
    const has = (await get('SELECT 1 AS x FROM patient_access WHERE patient_id=? AND mobile=? AND revoked_at IS NULL', [p.id, mobile]));
    if (!has) {
      await insert("INSERT INTO patient_access (patient_id, mobile, kind, relation, granted_by) VALUES (?,?,'self',NULL,NULL)", [p.id, mobile]);
      await logAccess('patient', p.id, 'self_grant_created', 'patient', p.id, mask(mobile));
    }
  }
}

app.post('/api/auth/patient/request-otp', async (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'invalid_mobile' });
  const known = (await authorizedPatientIds(mobile)).length > 0;
  if (!known) {
    await logAccess('anonymous', null, 'otp_unknown_mobile', 'mobile', null, mask(mobile));
    return res.status(404).json({ error: 'not_registered' });
  }
  const r = await requestOTP(mobile, 'login');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true });
});

// Self-registration for patients whose number is not yet known. Creates an
// EMPTY patient record - no reports are attached at registration, and no grant
// exists until the first successful OTP verify (see ensureSelfGrants). Lab
// reports reach the account ONLY through staff identity attestation: a
// confirmed merge (patient_merges) or a front-desk walk-in entry. A LIS import
// never converges with a self-registered record on its own (see lis.js).
// Numbers already known (registered at a lab/collection centre) are told to
// log in instead.
app.post('/api/auth/patient/register', async (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const fullName = String(req.body.fullName || '').trim();
  const language = String(req.body.language || 'en');
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'invalid_mobile' });
  if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ error: 'invalid_name' });
  if (!['en', 'te', 'hi'].includes(language)) return res.status(400).json({ error: 'bad_lang' });
  const known = (await get('SELECT COUNT(*) c FROM patients WHERE mobile=?', [mobile])).c > 0;
  if (known) return res.status(409).json({ error: 'already_registered' });
  const age = req.body.age == null || req.body.age === '' ? null : parseInt(req.body.age, 10);
  if (age != null && (!Number.isInteger(age) || age < 0 || age > 120)) return res.status(400).json({ error: 'invalid_age' });
  let sex = String(req.body.sex || '').trim().toUpperCase();
  if (!['M', 'F', 'O'].includes(sex)) sex = null;
  (await run("INSERT INTO patients (full_name, age, sex, mobile, preferred_language, created_via) VALUES (?,?,?,?,?,'self')", [fullName, age, sex, mobile, language]));
  await logAccess('patient', null, 'patient_register', 'mobile', null, mask(mobile));
  const r = await requestOTP(mobile, 'login');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true });
});

app.post('/api/auth/patient/verify', async (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const v = await verifyOTP(mobile, String(req.body.code || ''), 'login', { consume: req.body.consent === true });
  if (v.error) return res.status(400).json(v);
  await ensureSelfGrants(mobile);
  const ids = await authorizedPatientIds(mobile);
  const patients = ids.length
    ? (await all(`SELECT id, full_name, age, sex, preferred_language, consent_given_at FROM patients WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids))
    : [];
  const needsConsent = patients.some(p => !p.consent_given_at);
  if (needsConsent && req.body.consent !== true) {
    // OTP verified but not consumed yet; client re-submits with consent
    return res.json({ ok: true, needsConsent: true, patients: patients.map(p => ({ id: p.id, full_name: p.full_name })) });
  }
  if (needsConsent && req.body.consent === true) {
    (await run('UPDATE patients SET consent_given_at=? WHERE mobile=? AND consent_given_at IS NULL', [now(), mobile]));
    await logAccess('patient', patients[0]?.id ?? null, 'consent_given', 'mobile', null, mask(mobile));
    for (const p of patients) if (!p.consent_given_at) p.consent_given_at = now();
  }
  const token = await createSession('patient', patients[0].id, `mobile:${mobile}`, 12);
  setSessionCookie(res, token);
  await logAccess('patient', patients[0].id, 'login', 'mobile', null, mask(mobile));
  res.json({ ok: true, needsConsent: false, patients });
});

app.get('/api/patient/me', requireRole('patient'), async (req, res) => {
  const mobile = req.actor.scope.replace('mobile:', '');
  const ids = await authorizedPatientIds(mobile);
  const patients = ids.length
    ? (await all(`SELECT id, full_name, age, sex, preferred_language FROM patients WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids))
    : [];
  res.json({ mobile: mask(mobile), patients });
});

app.post('/api/patient/language', requireRole('patient'), async (req, res) => {
  const lang = req.body.lang;
  if (!['en', 'te', 'hi'].includes(lang)) return res.status(400).json({ error: 'bad_lang' });
  const mobile = req.actor.scope.replace('mobile:', '');
  const ids = await authorizedPatientIds(mobile);
  const pid = req.body.patientId ?? req.actor.id;
  if (!ids.includes(Number(pid))) return res.status(403).json({ error: 'not_authorized' });
  (await run('UPDATE patients SET preferred_language=? WHERE id=?', [lang, pid]));
  res.json({ ok: true });
});

async function orderForPatient(req, orderId) {
  const mobile = req.actor.scope.replace('mobile:', '');
  const ids = await authorizedPatientIds(mobile);
  if (!ids.length) return null;
  return (await get(
    `SELECT o.*, p.full_name patient_name, p.age, p.sex, p.mobile, p.preferred_language, d.full_name doctor_name
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE o.id=? AND p.id IN (${ids.map(() => '?').join(',')})`, [orderId, ...ids]));
}

app.get('/api/patient/orders', requireRole('patient'), async (req, res) => {
  const mobile = req.actor.scope.replace('mobile:', '');
  const ids = await authorizedPatientIds(mobile);
  if (!ids.length) return res.json({ orders: [] });
  const rows = (await all(
    `SELECT o.id, o.order_code, o.status, o.ordered_at, o.signed_at, o.patient_id, p.full_name patient_name, d.full_name doctor_name
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE p.id IN (${ids.map(() => '?').join(',')}) ORDER BY o.ordered_at DESC, o.id DESC`, ids));
  res.json({ orders: rows });
});

app.get('/api/patient/orders/:id', requireRole('patient'), async (req, res) => {
  const order = await orderForPatient(req, req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const results = (await all(
    `SELECT r.*, s.id summary_id, s.lang_en, s.lang_te, s.lang_hi, s.confidence, s.engine,
       (SELECT COUNT(*) FROM summary_flags f WHERE f.summary_id=s.id AND f.status='open') flagged
     FROM results r LEFT JOIN summaries s ON s.result_id=r.id WHERE r.order_id=?`, [order.id]));
  await logAccess('patient', req.actor.id, 'report_view', 'order', order.id, order.order_code);
  res.json({ order, results, hasPdf: ['ready', 'ready_critical'].includes(order.status) });
});

app.get('/api/patient/orders/:id/pdf', requireRole('patient'), async (req, res) => {
  const order = await orderForPatient(req, req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const file = await ensurePdf(order);
  if (!file) return res.status(404).json({ error: 'no_pdf' });
  await logAccess('patient', req.actor.id, 'pdf_download', 'order', order.id, order.order_code);
  res.download(file, `${order.order_code}.pdf`);
});

app.post('/api/patient/summaries/:id/flag', requireRole('patient'), async (req, res) => {
  const s = (await get('SELECT * FROM summaries WHERE id=?', [req.params.id]));
  if (!s) return res.status(404).json({ error: 'not_found' });
  (await run('INSERT INTO summary_flags (summary_id, patient_id, reason) VALUES (?,?,?)', [s.id, req.actor.id, String(req.body.reason || '').slice(0, 500)]));
  await logAccess('patient', req.actor.id, 'summary_flagged', 'summary', s.id, null);
  res.json({ ok: true });
});

// ---------- secure link flow ----------
async function linkByToken(token) {
  return (await get(
    `SELECT l.*, o.order_code, o.patient_id, p.mobile, p.full_name patient_name
     FROM report_links l JOIN orders o ON o.id=l.order_id JOIN patients p ON p.id=o.patient_id
     WHERE l.token_hash=?`, [sha256(token || '')]));
}

// A secure link lives only as long as the lab's authorization does: revoke the
// contact/self grant behind it and existing link sessions die too - revocation
// is not just about new logins.
async function linkStillAuthorized(l) {
  return !!(await get(
    `SELECT 1 AS x FROM patient_access WHERE patient_id=? AND mobile=? AND kind IN ('contact','self') AND revoked_at IS NULL`,
    [l.patient_id, l.mobile]));
}

app.get('/api/link/:token', async (req, res) => {
  const l = await linkByToken(req.params.token);
  if (!l) return res.status(404).json({ error: 'not_found' });
  if (l.revoked) return res.status(410).json({ error: 'revoked' });
  if (l.expires_at < now()) {
    await logAccess('anonymous', null, 'link_expired_open', 'order', l.order_id, l.order_code);
    return res.status(410).json({ error: 'expired', mobile: mask(l.mobile), orderCode: l.order_code });
  }
  await logAccess('anonymous', null, 'link_open', 'order', l.order_id, l.order_code);
  res.json({ ok: true, orderCode: l.order_code, mobile: mask(l.mobile), expiresAt: l.expires_at });
});

app.post('/api/link/:token/request-otp', async (req, res) => {
  const l = await linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  const r = await requestOTP(l.mobile, 'link');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true, mobile: mask(l.mobile) });
});

app.post('/api/link/:token/verify', async (req, res) => {
  const l = await linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  if (!(await linkStillAuthorized(l))) return res.status(403).json({ error: 'access_revoked' });
  const v = await verifyOTP(l.mobile, String(req.body.code || ''), 'link');
  if (v.error) return res.status(400).json(v);
  const token = await createSession('link', l.patient_id, `order:${l.order_id}`, 2);
  setSessionCookie(res, token);
  await logAccess('patient', l.patient_id, 'link_verified', 'order', l.order_id, l.order_code);
  res.json({ ok: true, orderId: l.order_id });
});

app.get('/api/link/:token/report', async (req, res) => {
  const l = await linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  if (!(await linkStillAuthorized(l))) return res.status(403).json({ error: 'access_revoked' });
  const s = await getSession(req.cookies?.ll_session);
  if (!s || s.actor_type !== 'link' || s.scope !== `order:${l.order_id}`) return res.status(401).json({ error: 'otp_required' });
  const order = (await get(
    `SELECT o.*, p.full_name patient_name, p.age, p.sex, p.preferred_language, d.full_name doctor_name
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id WHERE o.id=?`, [l.order_id]));
  const results = (await all(
    `SELECT r.*, s.id summary_id, s.lang_en, s.lang_te, s.lang_hi, s.confidence, s.engine
     FROM results r LEFT JOIN summaries s ON s.result_id=r.id WHERE r.order_id=?`, [l.order_id]));
  await logAccess('patient', l.patient_id, 'report_view_via_link', 'order', l.order_id, l.order_code);
  res.json({ order, results, hasPdf: ['ready', 'ready_critical'].includes(order.status) });
});

app.get('/api/link/:token/pdf', async (req, res) => {
  const l = await linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  if (!(await linkStillAuthorized(l))) return res.status(403).json({ error: 'access_revoked' });
  const s = await getSession(req.cookies?.ll_session);
  if (!s || s.actor_type !== 'link' || s.scope !== `order:${l.order_id}`) return res.status(401).json({ error: 'otp_required' });
  const order = (await get('SELECT * FROM orders WHERE id=?', [l.order_id]));
  const file = await ensurePdf(order);
  if (!file) return res.status(404).json({ error: 'no_pdf' });
  await logAccess('patient', l.patient_id, 'pdf_download_via_link', 'order', l.order_id, order.order_code);
  res.download(file, `${order.order_code}.pdf`);
});

// Weekly AI-summary quality sample: the pathologist reviews up to 50 summaries
// from the last 7 days (client brief safety requirement).
app.get('/api/staff/summary-sample', requireRole('staff'), async (req, res) => {
  const rows = (await all(
    `SELECT s.id, s.lang_en, s.lang_te, s.lang_hi, s.engine, s.created_at,
            r.parameter, r.value, r.unit, r.reference_range, r.flag,
            o.order_code, p.full_name patient_name,
            (SELECT verdict FROM summary_reviews v WHERE v.summary_id=s.id AND v.staff_id=?) AS my_verdict
     FROM summaries s
     JOIN results r ON r.id=s.result_id
     JOIN orders o ON o.id=r.order_id
     JOIN patients p ON p.id=o.patient_id
     WHERE s.created_at >= datetime('now','-7 days')
     ORDER BY RANDOM() LIMIT 50`, [req.actor.id]));
  res.json({ sample: rows });
});

app.post('/api/staff/summary-sample/:id/review', requireRole('staff'), async (req, res) => {
  const verdict = req.body?.verdict;
  if (!['ok', 'needs_fix'].includes(verdict)) return res.status(400).json({ error: 'bad_verdict' });
  const sum = (await get('SELECT id FROM summaries WHERE id=?', [req.params.id]));
  if (!sum) return res.status(404).json({ error: 'not_found' });
  (await run(`INSERT INTO summary_reviews (summary_id, staff_id, verdict) VALUES (?,?,?)
    ON CONFLICT(summary_id, staff_id) DO UPDATE SET verdict=excluded.verdict, created_at=datetime('now')`, [sum.id, req.actor.id, verdict]));
  await logAccess('staff', req.actor.id, 'summary_quality_review', 'summary', sum.id, verdict);
  res.json({ ok: true });
});

// ---------- staff auth + console ----------
app.post('/api/auth/staff/login', async (req, res) => {
  const { username, password } = req.body || {};
  const staff = (await get('SELECT * FROM staff WHERE username=?', [String(username || '')]));
  if (!staff || !verifyPassword(password || '', staff.password_hash)) {
    await logAccess('anonymous', null, 'staff_login_failed', 'staff', null, String(username || '').slice(0, 40));
    return res.status(401).json({ error: 'bad_credentials' });
  }
  const token = await createSession('staff', staff.id, `role:${staff.role}`, 12);
  setSessionCookie(res, token);
  await logAccess('staff', staff.id, 'login', 'staff', staff.id, staff.username);
  res.json({ ok: true, name: staff.full_name, role: staff.role });
});

app.get('/api/staff/me', requireRole('staff'), async (req, res) => {
  const s = (await get('SELECT id, username, full_name, role FROM staff WHERE id=?', [req.actor.id]));
  res.json(s);
});

app.get('/api/staff/patients', requireRole('staff'), async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = (await all(
    `SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id=p.id) orders
     FROM patients p WHERE p.full_name LIKE ? OR p.mobile LIKE ? ORDER BY p.id DESC LIMIT 25`, [q, q]));
  res.json({ patients: rows.map(p => ({ ...p, mobile: mask(p.mobile) })) });
});

app.get('/api/staff/patients/:id', requireRole('staff'), async (req, res) => {
  const p = (await get('SELECT * FROM patients WHERE id=?', [req.params.id]));
  if (!p) return res.status(404).json({ error: 'not_found' });
  const orders = (await all(
    `SELECT o.*, d.full_name doctor_name FROM orders o LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE o.patient_id=? ORDER BY o.ordered_at DESC`, [p.id]));
  const messages = (await all('SELECT * FROM outbox WHERE to_mobile=? ORDER BY id DESC LIMIT 50', [p.mobile]));
  const access = (await all(
    `SELECT * FROM access_log WHERE (entity='order' AND entity_id IN (SELECT id FROM orders WHERE patient_id=?))
     OR (entity='mobile' AND detail LIKE ?) ORDER BY id DESC LIMIT 50`, [p.id, `%${mask(p.mobile)}%`]));
  const familyAccess = (await all(
    `SELECT pa.id, pa.mobile, pa.kind, pa.relation, pa.created_at, s.full_name granted_by_name
     FROM patient_access pa LEFT JOIN staff s ON s.id=pa.granted_by
     WHERE pa.patient_id=? AND pa.revoked_at IS NULL ORDER BY pa.id DESC`, [p.id]));
  const contactVerified = !!(await get(
    `SELECT 1 AS x FROM patient_access WHERE patient_id=? AND mobile=? AND kind IN ('contact','self') AND revoked_at IS NULL`, [p.id, p.mobile]));
  await logAccess('staff', req.actor.id, 'patient_lookup', 'patient', p.id, p.full_name);
  res.json({ patient: { ...p, mobile: mask(p.mobile) }, orders, messages, access,
    contactVerified,
    familyAccess: familyAccess.map((g) => ({ ...g, mobile: mask(g.mobile) })) });
});

// Front-desk contact attestation for a lab-created patient: the ONLY way a
// lab/imported record becomes reachable by its contact mobile. Without it the
// patient exists for messaging but cannot log in - phone possession alone
// grants nothing.
app.post('/api/staff/patients/:id/verify-contact', requireRole('staff'), async (req, res) => {
  if (req.body?.attested !== true) return res.status(400).json({ error: 'attestation_required' });
  const p = (await get('SELECT * FROM patients WHERE id=?', [req.params.id]));
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (String(p.mobile).startsWith('unknown-')) return res.status(400).json({ error: 'no_mobile' });
  const existing = (await get(`SELECT 1 AS x FROM patient_access WHERE patient_id=? AND mobile=? AND kind IN ('contact','self') AND revoked_at IS NULL`, [p.id, p.mobile]));
  if (existing) return res.status(409).json({ error: 'already_verified' });
  await insert("INSERT INTO patient_access (patient_id, mobile, kind, granted_by) VALUES (?,?,'contact',?)", [p.id, p.mobile, req.actor.id]);
  await logAccess('staff', req.actor.id, 'contact_verified', 'patient', p.id, mask(p.mobile));
  res.json({ ok: true });
});

// Pending identity matches raised by LIS imports (lab record vs self-registered
// account with the same mobile+name). Nothing attaches until staff confirm.
app.get('/api/staff/merges', requireRole('staff'), async (req, res) => {
  const rows = (await all(
    `SELECT m.id, m.status, m.created_at,
            lp.full_name lab_name, lp.mobile lab_mobile, lp.created_via lab_via,
            sp.full_name self_name, sp.mobile self_mobile
     FROM patient_merges m
     JOIN patients lp ON lp.id=m.lab_patient_id JOIN patients sp ON sp.id=m.self_patient_id
     WHERE m.status='pending' ORDER BY m.id DESC`, []));
  res.json({ merges: rows.map((r) => ({ ...r, lab_mobile: mask(r.lab_mobile), self_mobile: mask(r.self_mobile) })) });
});

app.post('/api/staff/merges/:id/confirm', requireRole('staff'), async (req, res) => {
  if (req.body?.attested !== true) return res.status(400).json({ error: 'attestation_required' });
  const m = (await get("SELECT * FROM patient_merges WHERE id=? AND status='pending'", [req.params.id]));
  if (!m) return res.status(404).json({ error: 'not_found' });
  (await run('UPDATE orders SET patient_id=? WHERE patient_id=?', [m.self_patient_id, m.lab_patient_id]));
  (await run('UPDATE patients SET merged_into=? WHERE id=?', [m.self_patient_id, m.lab_patient_id]));
  (await run("UPDATE patient_merges SET status='confirmed', resolved_at=?, resolved_by=? WHERE id=?", [now(), req.actor.id, m.id]));
  await logAccess('staff', req.actor.id, 'patient_merge_confirmed', 'patient', m.self_patient_id, `lab record #${m.lab_patient_id} merged after identity attestation`);
  res.json({ ok: true });
});

app.post('/api/staff/merges/:id/reject', requireRole('staff'), async (req, res) => {
  const m = (await get("SELECT * FROM patient_merges WHERE id=? AND status='pending'", [req.params.id]));
  if (!m) return res.status(404).json({ error: 'not_found' });
  (await run("UPDATE patient_merges SET status='rejected', resolved_at=?, resolved_by=? WHERE id=?", [now(), req.actor.id, m.id]));
  await logAccess('staff', req.actor.id, 'patient_merge_rejected', 'patient', m.lab_patient_id, `kept separate from self-registered #${m.self_patient_id}`);
  res.json({ ok: true });
});

// Lab-verified delegation: front desk grants a relative's mobile access to
// this patient's reports. Granting is explicit, staff-attributed, revocable.
app.post('/api/staff/patients/:id/access', requireRole('staff'), async (req, res) => {
  const p = (await get('SELECT * FROM patients WHERE id=?', [req.params.id]));
  if (!p) return res.status(404).json({ error: 'not_found' });
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'invalid_mobile' });
  if (mobile === p.mobile) return res.status(409).json({ error: 'own_contact_mobile' });
  const relation = String(req.body.relation || '').trim().slice(0, 40) || null;
  const existing = (await get('SELECT * FROM patient_access WHERE patient_id=? AND mobile=? AND revoked_at IS NULL', [p.id, mobile]));
  if (existing) return res.status(409).json({ error: 'already_granted' });
  const id = await insert("INSERT INTO patient_access (patient_id, mobile, kind, relation, granted_by) VALUES (?,?,'delegated',?,?)", [p.id, mobile, relation, req.actor.id]);
  await logAccess('staff', req.actor.id, 'family_access_grant', 'patient', p.id, `${mask(mobile)}${relation ? ' (' + relation + ')' : ''}`);
  res.json({ ok: true, id });
});

app.post('/api/staff/patients/:id/access/:grantId/revoke', requireRole('staff'), async (req, res) => {
  const g = (await get('SELECT * FROM patient_access WHERE id=? AND patient_id=? AND revoked_at IS NULL', [req.params.grantId, req.params.id]));
  if (!g) return res.status(404).json({ error: 'not_found' });
  (await run('UPDATE patient_access SET revoked_at=?, revoked_by=? WHERE id=?', [now(), req.actor.id, g.id]));
  await logAccess('staff', req.actor.id, 'family_access_revoke', 'patient', g.patient_id, mask(g.mobile));
  res.json({ ok: true });
});

app.post('/api/staff/resend', requireRole('staff'), async (req, res) => {
  const m = await resendMessage(Number(req.body.outboxId), req.actor);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, message: m });
});

app.post('/api/staff/orders/:id/resend-link', requireRole('staff'), async (req, res) => {
  const order = (await get('SELECT * FROM orders WHERE id=?', [req.params.id]));
  if (!order || order.status === 'processing') return res.status(400).json({ error: 'not_ready' });
  const patient = (await get('SELECT * FROM patients WHERE id=?', [order.patient_id]));
  const token = randomToken();
  (await run('INSERT INTO report_links (token_hash, order_id, expires_at) VALUES (?,?,?)', [sha256(token), order.id, addHours(72)]));
  const link = `${BASE_URL}/r/${token}`;
  await queueMessage({ channel: 'whatsapp', toMobile: patient.mobile, kind: 'report_resent', orderId: order.id,
    body: `Namaste ${patient.full_name} garu, here is your secure report link again for ${order.order_code} (valid 72 hours): ${link} - Company A Diagnostics` });
  await logAccess('staff', req.actor.id, 'link_resent', 'order', order.id, order.order_code);
  res.json({ ok: true });
});

app.post('/api/staff/import', requireRole('staff'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const report = await importCSV(req.file.buffer.toString('utf8'), req.actor);
  res.json(report);
});

// Manual front-desk entry: register a walk-in patient + order without the LIS
// CSV. Staff see the person at the desk, so this endpoint is the lab's identity
// attestation event - it REQUIRES contactVerified:true, and that attestation is
// what creates the 'contact' grant that later lets the patient log in.
// Without the attestation the entry is refused (400). The order lands in
// processing; the pathologist reviews and signs as usual.
app.post('/api/staff/orders', requireRole('staff'), async (req, res) => {
  const b = req.body || {};
  if (b.contactVerified !== true) return res.status(400).json({ error: 'contact_attestation_required' });
  const fullName = String(b.patientName || '').trim();
  const mobile = String(b.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const doctorName = String(b.doctorName || '').trim();
  const age = b.age == null || b.age === '' ? null : parseInt(b.age, 10);
  let sex = String(b.sex || '').trim().toUpperCase();
  if (!['M', 'F', 'O'].includes(sex)) sex = null;
  const results = Array.isArray(b.results) ? b.results : [];
  if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ error: 'invalid_name' });
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'invalid_mobile' });
  if (age != null && (!Number.isInteger(age) || age < 0 || age > 120)) return res.status(400).json({ error: 'invalid_age' });
  if (!results.length || results.length > 20) return res.status(400).json({ error: 'no_results' });
  for (const r of results) {
    const p = String(r?.parameter || '').trim();
    const v = String(r?.value ?? '').trim();
    if (p.length < 2 || p.length > 80 || !v || v.length > 40) return res.status(400).json({ error: 'invalid_result' });
  }
  // Prefer the person's own self-registered account when it matches (staff
  // attestation covers it); otherwise reuse a lab record; otherwise create one.
  let patient = (await get("SELECT * FROM patients WHERE mobile=? AND lower(trim(full_name))=lower(trim(?)) AND merged_into IS NULL ORDER BY (created_via='self') DESC LIMIT 1", [mobile, fullName]));
  if (patient && patient.created_via === 'self') {
    await logAccess('staff', req.actor.id, 'patient_identity_attested', 'patient', patient.id, `self-registered ${fullName} attested at front desk`);
  }
  if (!patient) {
    const pid = await insert('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)', [fullName, age, sex, mobile]);
    patient = (await get('SELECT * FROM patients WHERE id=?', [pid]));
  }
  // The staff attestation creates the contact grant that authorizes login.
  const hasGrant = (await get('SELECT 1 AS x FROM patient_access WHERE patient_id=? AND mobile=? AND revoked_at IS NULL', [patient.id, mobile]));
  if (!hasGrant) {
    await insert("INSERT INTO patient_access (patient_id, mobile, kind, granted_by) VALUES (?,?,'contact',?)", [patient.id, mobile, req.actor.id]);
  }
  await logAccess('staff', req.actor.id, 'contact_attested', 'patient', patient.id, mask(mobile));
  let doctorId = null;
  if (doctorName) {
    let d = (await get('SELECT * FROM doctors WHERE full_name=?', [doctorName]));
    if (!d) { const did = await insert('INSERT INTO doctors (full_name) VALUES (?)', [doctorName]); d = (await get('SELECT * FROM doctors WHERE id=?', [did])); }
    doctorId = d.id;
  }
  const codes = (await all('SELECT order_code FROM orders')).map((r) => parseInt(String(r.order_code).replace(/^ORD-/, ''), 10)).filter((n) => !isNaN(n));
  const orderCode = `ORD-${Math.max(71200, ...codes) + 1}`;
  const oid = await insert('INSERT INTO orders (order_code, patient_id, doctor_id, status) VALUES (?,?,?,?)', [orderCode, patient.id, doctorId, 'processing']);
  for (const r of results) {
    const parameter = String(r.parameter).trim();
    const range = String(r.referenceRange || '').trim() || null;
    const unit = String(r.unit || '').trim() || null;
    const value = String(r.value).trim();
    (await run('INSERT INTO results (order_id, parameter, unit, value, reference_range, flag) VALUES (?,?,?,?,?,?)', [oid, parameter, unit, value, range, flagResult(value, range, findKBEntry(parameter))]));
  }
  await logAccess('staff', req.actor.id, 'order_created', 'order', oid, `${orderCode} manual front-desk entry for ${fullName}`);
  res.json({ ok: true, orderId: oid, orderCode, patientId: patient.id });
});

app.get('/api/staff/orders', requireRole('staff'), async (req, res) => {
  const status = ['processing', 'ready', 'ready_critical'].includes(req.query.status) ? req.query.status : 'processing';
  const rows = (await all(
    `SELECT o.id, o.order_code, o.status, o.ordered_at, p.full_name patient_name, d.full_name doctor_name,
            (SELECT COUNT(*) FROM results r WHERE r.order_id=o.id AND r.flag IN ('high','low')) flagged,
            (SELECT COUNT(*) FROM results r WHERE r.order_id=o.id AND r.flag='critical') critical,
            (SELECT COUNT(*) FROM results r WHERE r.order_id=o.id AND r.flag='unknown') no_range
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE o.status=? ORDER BY o.ordered_at DESC LIMIT 50`, [status]));
  res.json({ orders: rows });
});

app.post('/api/staff/orders/:id/signoff', requireRole('staff'), async (req, res) => {
  const r = await signOffOrder(Number(req.params.id), req.body.signedBy || 'Duty Pathologist', req.actor);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.get('/api/staff/tasks', requireRole('staff'), async (req, res) => {
  const callbacks = (await all(
    `SELECT t.*, o.order_code, p.full_name patient_name, p.mobile
     FROM callback_tasks t JOIN orders o ON o.id=t.order_id JOIN patients p ON p.id=o.patient_id
     ORDER BY t.status='done', t.id DESC`, []))
    .map(t => ({ ...t, mobile: mask(t.mobile) }));
  const flags = (await all(
    `SELECT f.*, s.lang_en, r.parameter, r.value, r.unit, o.order_code, p.full_name patient_name
     FROM summary_flags f JOIN summaries s ON s.id=f.summary_id JOIN results r ON r.id=s.result_id
     JOIN orders o ON o.id=r.order_id JOIN patients p ON p.id=f.patient_id
     ORDER BY f.status='reviewed', f.id DESC LIMIT 100`, []));
  res.json({ callbacks, flags });
});

app.post('/api/staff/tasks/:id/done', requireRole('staff'), async (req, res) => {
  (await run(`UPDATE callback_tasks SET status='done', done_at=?, done_by=? WHERE id=?`, [now(), req.actor.id, req.params.id]));
  await logAccess('staff', req.actor.id, 'callback_done', 'callback_task', Number(req.params.id), null);
  res.json({ ok: true });
});

app.post('/api/staff/summary-flags/:id/review', requireRole('staff'), async (req, res) => {
  (await run(`UPDATE summary_flags SET status='reviewed', reviewed_at=?, reviewed_by=? WHERE id=?`, [now(), req.actor.id, req.params.id]));
  await logAccess('staff', req.actor.id, 'summary_flag_reviewed', 'summary_flag', Number(req.params.id), null);
  res.json({ ok: true });
});

app.get('/api/staff/outbox', requireRole('staff'), async (req, res) => {
  // Optional exact-mobile filter happens BEFORE masking, so front desk can
  // pull one person's delivery history (e.g. to read a doctor's demo OTP).
  const mobile = String(req.query.mobile || '').replace(/\D/g, '');
  const rows = (/^\d{10}$/.test(mobile)
    ? (await all('SELECT * FROM outbox WHERE to_mobile=? ORDER BY id DESC LIMIT 100', [mobile]))
    : (await all('SELECT * FROM outbox ORDER BY id DESC LIMIT 100', [])))
    .map(m => ({ ...m, to_mobile: mask(m.to_mobile) }));
  res.json({ messages: rows });
});

app.get('/api/staff/access-log', requireRole('staff'), async (req, res) => {
  const rows = (await all('SELECT * FROM access_log ORDER BY id DESC LIMIT 200', []));
  res.json({ log: rows });
});

app.get('/api/staff/ops-report', requireRole('staff'), async (req, res) => {
  // Delivery metrics are scoped to report-ready notifications so the numbers
  // reconcile: linksSent = delivered + failed + inFlight (queued/sent).
  // OTP messages are a separate, clearly-labelled count.
  const nstat = (await all(`SELECT status, COUNT(*) c FROM outbox WHERE kind='report_ready' GROUP BY status`, []));
  const n = (k) => nstat.find((s) => s.status === k)?.c || 0;
  const notif = {
    linksSent: n('delivered') + n('failed') + n('sent') + n('queued'),
    delivered: n('delivered'),
    failed: n('failed'),
    inFlight: n('sent') + n('queued'),
  };
  const otpMessages = (await get(`SELECT COUNT(*) c FROM outbox WHERE kind='otp'`, [])).c;
  const orders = (await all('SELECT status, COUNT(*) c FROM orders GROUP BY status', []));
  const views = (await get(`SELECT COUNT(*) c FROM access_log WHERE action LIKE 'report_view%'`, [])).c;
  const downloads = (await get(`SELECT COUNT(*) c FROM access_log WHERE action='pdf_download'`, [])).c;
  const openCallbacks = (await get(`SELECT COUNT(*) c FROM callback_tasks WHERE status='open'`, [])).c;
  const openFlags = (await get(`SELECT COUNT(*) c FROM summary_flags WHERE status='open'`, [])).c;
  const daily = (await all(
    `SELECT date(created_at) day, COUNT(*) messages FROM outbox GROUP BY date(created_at) ORDER BY day DESC LIMIT 14`, []));
  await logAccess('staff', req.actor.id, 'ops_report_view', null, null, null);
  res.json({ notif, otpMessages, orders, views, downloads, openCallbacks, openFlags, daily });
});

// ---------- doctor view (optional depth) ----------
app.post('/api/auth/doctor/request-otp', async (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const known = (await get('SELECT COUNT(*) c FROM doctors WHERE mobile=?', [mobile])).c > 0;
  if (!known) return res.status(404).json({ error: 'not_registered' });
  const r = await requestOTP(mobile, 'doctor');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true });
});
app.post('/api/auth/doctor/verify', async (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const v = await verifyOTP(mobile, String(req.body.code || ''), 'doctor');
  if (v.error) return res.status(400).json(v);
  const doc = (await get('SELECT * FROM doctors WHERE mobile=?', [mobile]));
  const token = await createSession('doctor', doc.id, null, 12);
  setSessionCookie(res, token);
  await logAccess('doctor', doc.id, 'login', 'doctor', doc.id, doc.full_name);
  res.json({ ok: true, name: doc.full_name });
});
app.get('/api/doctor/reports', requireRole('doctor'), async (req, res) => {
  const rows = (await all(
    `SELECT o.id, o.order_code, o.status, o.signed_at, p.full_name patient_name, p.age, p.sex
     FROM orders o JOIN patients p ON p.id=o.patient_id
     WHERE o.doctor_id=? AND o.status!='processing' AND o.signed_at > datetime('now','-90 days')
     ORDER BY o.signed_at DESC`, [req.actor.id]));
  await logAccess('doctor', req.actor.id, 'doctor_list_view', null, null, null);
  res.json({ reports: rows });
});
app.get('/api/doctor/orders/:id', requireRole('doctor'), async (req, res) => {
  const order = (await get(
    `SELECT o.*, p.full_name patient_name, p.age, p.sex FROM orders o JOIN patients p ON p.id=o.patient_id
     WHERE o.id=? AND o.doctor_id=?`, [req.params.id, req.actor.id]));
  if (!order) return res.status(404).json({ error: 'not_found' });
  const results = (await all('SELECT * FROM results WHERE order_id=?', [order.id]));
  await logAccess('doctor', req.actor.id, 'report_view', 'order', order.id, order.order_code);
  res.json({ order, results });
});


// PDFs are cached files on an ephemeral filesystem; the database is the
// source of truth, so regenerate a missing PDF on demand.
async function ensurePdf(order) {
  const file = path.join(DATA_DIR, 'pdfs', `${order.order_code}.pdf`);
  if (!fs.existsSync(file)) {
    const patient = await get('SELECT * FROM patients WHERE id=?', [order.patient_id]);
    const doctor = order.doctor_id ? await get('SELECT * FROM doctors WHERE id=?', [order.doctor_id]) : null;
    const results = await all('SELECT * FROM results WHERE order_id=?', [order.id]);
    if (!patient || !results.length) return null;
    await generateReportPDF(order, patient, doctor, results);
  }
  return file;
}

// ---------- errors ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('api error:', err.message);
  res.status(500).json({ error: 'internal' });
});

// ---------- static client ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

setInterval(tickOutbox, 5000).unref();

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  app.listen(PORT, () => console.log(`LabLink listening on ${BASE_URL}`));
}
