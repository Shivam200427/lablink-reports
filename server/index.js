import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, logAccess } from './db.js';
import { requestOTP, verifyOTP, createSession, getSession } from './otp.js';
import { hashPassword, verifyPassword, now, randomToken, sha256, addHours } from './crypto.js';
import { importCSV, signOffOrder } from './lis.js';
import { tickOutbox, resendMessage, queueMessage } from './outbox.js';
import { generateSummariesForOrder } from './summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const mask = (m) => (m && m.length >= 4 ? '*'.repeat(Math.max(0, m.length - 4)) + m.slice(-4) : '****');

function actor(req) {
  const s = getSession(req.cookies?.ll_session);
  if (!s) return null;
  return { type: s.actor_type, id: s.actor_id, scope: s.scope };
}
function requireRole(...types) {
  return (req, res, next) => {
    const a = actor(req);
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
app.post('/api/auth/patient/request-otp', (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'invalid_mobile' });
  const known = db.prepare('SELECT COUNT(*) c FROM patients WHERE mobile=?').get(mobile).c > 0;
  if (!known) {
    logAccess('anonymous', null, 'otp_unknown_mobile', 'mobile', null, mask(mobile));
    return res.status(404).json({ error: 'not_registered' });
  }
  const r = requestOTP(mobile, 'login');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true });
});

app.post('/api/auth/patient/verify', (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const v = verifyOTP(mobile, String(req.body.code || ''), 'login', { consume: req.body.consent === true });
  if (v.error) return res.status(400).json(v);
  const patients = db.prepare('SELECT id, full_name, age, sex, preferred_language, consent_given_at FROM patients WHERE mobile=?').all(mobile);
  const needsConsent = patients.some(p => !p.consent_given_at);
  if (needsConsent && req.body.consent !== true) {
    // OTP verified but not consumed yet; client re-submits with consent
    return res.json({ ok: true, needsConsent: true, patients: patients.map(p => ({ id: p.id, full_name: p.full_name })) });
  }
  if (needsConsent && req.body.consent === true) {
    db.prepare('UPDATE patients SET consent_given_at=? WHERE mobile=? AND consent_given_at IS NULL').run(now(), mobile);
    logAccess('patient', patients[0]?.id ?? null, 'consent_given', 'mobile', null, mask(mobile));
    for (const p of patients) if (!p.consent_given_at) p.consent_given_at = now();
  }
  const token = createSession('patient', patients[0].id, `mobile:${mobile}`, 12);
  setSessionCookie(res, token);
  logAccess('patient', patients[0].id, 'login', 'mobile', null, mask(mobile));
  res.json({ ok: true, needsConsent: false, patients });
});

app.get('/api/patient/me', requireRole('patient'), (req, res) => {
  const mobile = req.actor.scope.replace('mobile:', '');
  const patients = db.prepare('SELECT id, full_name, age, sex, preferred_language FROM patients WHERE mobile=?').all(mobile);
  res.json({ mobile: mask(mobile), patients });
});

app.post('/api/patient/language', requireRole('patient'), (req, res) => {
  const lang = req.body.lang;
  if (!['en', 'te', 'hi'].includes(lang)) return res.status(400).json({ error: 'bad_lang' });
  db.prepare('UPDATE patients SET preferred_language=? WHERE id=?').run(lang, req.body.patientId ?? req.actor.id);
  res.json({ ok: true });
});

function orderForPatient(req, orderId) {
  const mobile = req.actor.scope.replace('mobile:', '');
  return db.prepare(
    `SELECT o.*, p.full_name patient_name, p.age, p.sex, p.mobile, p.preferred_language, d.full_name doctor_name
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE o.id=? AND p.mobile=?`).get(orderId, mobile);
}

app.get('/api/patient/orders', requireRole('patient'), (req, res) => {
  const mobile = req.actor.scope.replace('mobile:', '');
  const rows = db.prepare(
    `SELECT o.id, o.order_code, o.status, o.ordered_at, o.signed_at, o.patient_id, p.full_name patient_name, d.full_name doctor_name
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE p.mobile=? ORDER BY o.ordered_at DESC, o.id DESC`).all(mobile);
  res.json({ orders: rows });
});

app.get('/api/patient/orders/:id', requireRole('patient'), (req, res) => {
  const order = orderForPatient(req, req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const results = db.prepare(
    `SELECT r.*, s.id summary_id, s.lang_en, s.lang_te, s.lang_hi, s.confidence,
       (SELECT COUNT(*) FROM summary_flags f WHERE f.summary_id=s.id AND f.status='open') flagged
     FROM results r LEFT JOIN summaries s ON s.result_id=r.id WHERE r.order_id=?`).all(order.id);
  logAccess('patient', req.actor.id, 'report_view', 'order', order.id, order.order_code);
  res.json({ order, results, hasPdf: fs.existsSync(path.join(DATA_DIR, 'pdfs', `${order.order_code}.pdf`)) });
});

app.get('/api/patient/orders/:id/pdf', requireRole('patient'), (req, res) => {
  const order = orderForPatient(req, req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const file = path.join(DATA_DIR, 'pdfs', `${order.order_code}.pdf`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'no_pdf' });
  logAccess('patient', req.actor.id, 'pdf_download', 'order', order.id, order.order_code);
  res.download(file, `${order.order_code}.pdf`);
});

app.post('/api/patient/summaries/:id/flag', requireRole('patient'), (req, res) => {
  const s = db.prepare('SELECT * FROM summaries WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not_found' });
  db.prepare('INSERT INTO summary_flags (summary_id, patient_id, reason) VALUES (?,?,?)')
    .run(s.id, req.actor.id, String(req.body.reason || '').slice(0, 500));
  logAccess('patient', req.actor.id, 'summary_flagged', 'summary', s.id, null);
  res.json({ ok: true });
});

// ---------- secure link flow ----------
function linkByToken(token) {
  return db.prepare(
    `SELECT l.*, o.order_code, o.patient_id, p.mobile, p.full_name patient_name
     FROM report_links l JOIN orders o ON o.id=l.order_id JOIN patients p ON p.id=o.patient_id
     WHERE l.token_hash=?`).get(sha256(token || ''));
}

app.get('/api/link/:token', (req, res) => {
  const l = linkByToken(req.params.token);
  if (!l) return res.status(404).json({ error: 'not_found' });
  if (l.revoked) return res.status(410).json({ error: 'revoked' });
  if (l.expires_at < now()) {
    logAccess('anonymous', null, 'link_expired_open', 'order', l.order_id, l.order_code);
    return res.status(410).json({ error: 'expired', mobile: mask(l.mobile), orderCode: l.order_code });
  }
  logAccess('anonymous', null, 'link_open', 'order', l.order_id, l.order_code);
  res.json({ ok: true, orderCode: l.order_code, mobile: mask(l.mobile), expiresAt: l.expires_at });
});

app.post('/api/link/:token/request-otp', (req, res) => {
  const l = linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  const r = requestOTP(l.mobile, 'link');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true, mobile: mask(l.mobile) });
});

app.post('/api/link/:token/verify', (req, res) => {
  const l = linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  const v = verifyOTP(l.mobile, String(req.body.code || ''), 'link');
  if (v.error) return res.status(400).json(v);
  const token = createSession('link', l.patient_id, `order:${l.order_id}`, 2);
  setSessionCookie(res, token);
  logAccess('patient', l.patient_id, 'link_verified', 'order', l.order_id, l.order_code);
  res.json({ ok: true, orderId: l.order_id });
});

app.get('/api/link/:token/report', (req, res) => {
  const l = linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  const s = getSession(req.cookies?.ll_session);
  if (!s || s.actor_type !== 'link' || s.scope !== `order:${l.order_id}`) return res.status(401).json({ error: 'otp_required' });
  const order = db.prepare(
    `SELECT o.*, p.full_name patient_name, p.age, p.sex, p.preferred_language, d.full_name doctor_name
     FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id WHERE o.id=?`).get(l.order_id);
  const results = db.prepare(
    `SELECT r.*, s.id summary_id, s.lang_en, s.lang_te, s.lang_hi, s.confidence
     FROM results r LEFT JOIN summaries s ON s.result_id=r.id WHERE r.order_id=?`).all(l.order_id);
  const pdfFile = path.join(DATA_DIR, 'pdfs', `${order.order_code}.pdf`);
  logAccess('patient', l.patient_id, 'report_view_via_link', 'order', l.order_id, l.order_code);
  res.json({ order, results, hasPdf: fs.existsSync(pdfFile) });
});

app.get('/api/link/:token/pdf', (req, res) => {
  const l = linkByToken(req.params.token);
  if (!l || l.revoked) return res.status(404).json({ error: 'not_found' });
  if (l.expires_at < now()) return res.status(410).json({ error: 'expired' });
  const s = getSession(req.cookies?.ll_session);
  if (!s || s.actor_type !== 'link' || s.scope !== `order:${l.order_id}`) return res.status(401).json({ error: 'otp_required' });
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(l.order_id);
  const file = path.join(DATA_DIR, 'pdfs', `${order.order_code}.pdf`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'no_pdf' });
  logAccess('patient', l.patient_id, 'pdf_download_via_link', 'order', l.order_id, order.order_code);
  res.download(file, `${order.order_code}.pdf`);
});

// Weekly AI-summary quality sample: the pathologist reviews up to 50 summaries
// from the last 7 days (client brief safety requirement).
app.get('/api/staff/summary-sample', requireRole('staff'), (req, res) => {
  const rows = db.prepare(
    `SELECT s.id, s.lang_en, s.lang_te, s.lang_hi, s.engine, s.created_at,
            r.parameter, r.value, r.unit, r.reference_range, r.flag,
            o.order_code, p.full_name patient_name,
            (SELECT verdict FROM summary_reviews v WHERE v.summary_id=s.id AND v.staff_id=?) AS my_verdict
     FROM summaries s
     JOIN results r ON r.id=s.result_id
     JOIN orders o ON o.id=r.order_id
     JOIN patients p ON p.id=o.patient_id
     WHERE s.created_at >= datetime('now','-7 days')
     ORDER BY RANDOM() LIMIT 50`).all(req.actor.id);
  res.json({ sample: rows });
});

app.post('/api/staff/summary-sample/:id/review', requireRole('staff'), (req, res) => {
  const verdict = req.body?.verdict;
  if (!['ok', 'needs_fix'].includes(verdict)) return res.status(400).json({ error: 'bad_verdict' });
  const sum = db.prepare('SELECT id FROM summaries WHERE id=?').get(req.params.id);
  if (!sum) return res.status(404).json({ error: 'not_found' });
  db.prepare(`INSERT INTO summary_reviews (summary_id, staff_id, verdict) VALUES (?,?,?)
    ON CONFLICT(summary_id, staff_id) DO UPDATE SET verdict=excluded.verdict, created_at=datetime('now')`)
    .run(sum.id, req.actor.id, verdict);
  logAccess('staff', req.actor.id, 'summary_quality_review', 'summary', sum.id, verdict);
  res.json({ ok: true });
});

// ---------- staff auth + console ----------
app.post('/api/auth/staff/login', (req, res) => {
  const { username, password } = req.body || {};
  const staff = db.prepare('SELECT * FROM staff WHERE username=?').get(String(username || ''));
  if (!staff || !verifyPassword(password || '', staff.password_hash)) {
    logAccess('anonymous', null, 'staff_login_failed', 'staff', null, String(username || '').slice(0, 40));
    return res.status(401).json({ error: 'bad_credentials' });
  }
  const token = createSession('staff', staff.id, `role:${staff.role}`, 12);
  setSessionCookie(res, token);
  logAccess('staff', staff.id, 'login', 'staff', staff.id, staff.username);
  res.json({ ok: true, name: staff.full_name, role: staff.role });
});

app.get('/api/staff/me', requireRole('staff'), (req, res) => {
  const s = db.prepare('SELECT id, username, full_name, role FROM staff WHERE id=?').get(req.actor.id);
  res.json(s);
});

app.get('/api/staff/patients', requireRole('staff'), (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id=p.id) orders
     FROM patients p WHERE p.full_name LIKE ? OR p.mobile LIKE ? ORDER BY p.id DESC LIMIT 25`).all(q, q);
  res.json({ patients: rows.map(p => ({ ...p, mobile: mask(p.mobile) })) });
});

app.get('/api/staff/patients/:id', requireRole('staff'), (req, res) => {
  const p = db.prepare('SELECT * FROM patients WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const orders = db.prepare(
    `SELECT o.*, d.full_name doctor_name FROM orders o LEFT JOIN doctors d ON d.id=o.doctor_id
     WHERE o.patient_id=? ORDER BY o.ordered_at DESC`).all(p.id);
  const messages = db.prepare('SELECT * FROM outbox WHERE to_mobile=? ORDER BY id DESC LIMIT 50').all(p.mobile);
  const access = db.prepare(
    `SELECT * FROM access_log WHERE (entity='order' AND entity_id IN (SELECT id FROM orders WHERE patient_id=?))
     OR (entity='mobile' AND detail LIKE ?) ORDER BY id DESC LIMIT 50`).all(p.id, `%${mask(p.mobile)}%`);
  logAccess('staff', req.actor.id, 'patient_lookup', 'patient', p.id, p.full_name);
  res.json({ patient: { ...p, mobile: mask(p.mobile) }, orders, messages, access });
});

app.post('/api/staff/resend', requireRole('staff'), (req, res) => {
  const m = resendMessage(Number(req.body.outboxId), req.actor);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, message: m });
});

app.post('/api/staff/orders/:id/resend-link', requireRole('staff'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order || order.status === 'processing') return res.status(400).json({ error: 'not_ready' });
  const patient = db.prepare('SELECT * FROM patients WHERE id=?').get(order.patient_id);
  const token = randomToken();
  db.prepare('INSERT INTO report_links (token_hash, order_id, expires_at) VALUES (?,?,?)')
    .run(sha256(token), order.id, addHours(72));
  const link = `${BASE_URL}/r/${token}`;
  queueMessage({ channel: 'whatsapp', toMobile: patient.mobile, kind: 'report_resent', orderId: order.id,
    body: `Namaste ${patient.full_name} garu, here is your secure report link again for ${order.order_code} (valid 72 hours): ${link} - Company A Diagnostics` });
  logAccess('staff', req.actor.id, 'link_resent', 'order', order.id, order.order_code);
  res.json({ ok: true });
});

app.post('/api/staff/import', requireRole('staff'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const report = importCSV(req.file.buffer.toString('utf8'), req.actor);
  res.json(report);
});

app.post('/api/staff/orders/:id/signoff', requireRole('staff'), async (req, res) => {
  const r = await signOffOrder(Number(req.params.id), req.body.signedBy || 'Duty Pathologist', req.actor);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.get('/api/staff/tasks', requireRole('staff'), (req, res) => {
  const callbacks = db.prepare(
    `SELECT t.*, o.order_code, p.full_name patient_name, p.mobile
     FROM callback_tasks t JOIN orders o ON o.id=t.order_id JOIN patients p ON p.id=o.patient_id
     ORDER BY t.status='done', t.id DESC`).all()
    .map(t => ({ ...t, mobile: mask(t.mobile) }));
  const flags = db.prepare(
    `SELECT f.*, s.lang_en, r.parameter, r.value, r.unit, o.order_code, p.full_name patient_name
     FROM summary_flags f JOIN summaries s ON s.id=f.summary_id JOIN results r ON r.id=s.result_id
     JOIN orders o ON o.id=r.order_id JOIN patients p ON p.id=f.patient_id
     ORDER BY f.status='reviewed', f.id DESC LIMIT 100`).all();
  res.json({ callbacks, flags });
});

app.post('/api/staff/tasks/:id/done', requireRole('staff'), (req, res) => {
  db.prepare(`UPDATE callback_tasks SET status='done', done_at=?, done_by=? WHERE id=?`).run(now(), req.actor.id, req.params.id);
  logAccess('staff', req.actor.id, 'callback_done', 'callback_task', Number(req.params.id), null);
  res.json({ ok: true });
});

app.post('/api/staff/summary-flags/:id/review', requireRole('staff'), (req, res) => {
  db.prepare(`UPDATE summary_flags SET status='reviewed', reviewed_at=?, reviewed_by=? WHERE id=?`).run(now(), req.actor.id, req.params.id);
  logAccess('staff', req.actor.id, 'summary_flag_reviewed', 'summary_flag', Number(req.params.id), null);
  res.json({ ok: true });
});

app.get('/api/staff/outbox', requireRole('staff'), (req, res) => {
  // Optional exact-mobile filter happens BEFORE masking, so front desk can
  // pull one person's delivery history (e.g. to read a doctor's demo OTP).
  const mobile = String(req.query.mobile || '').replace(/\D/g, '');
  const rows = (/^\d{10}$/.test(mobile)
    ? db.prepare('SELECT * FROM outbox WHERE to_mobile=? ORDER BY id DESC LIMIT 100').all(mobile)
    : db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 100').all())
    .map(m => ({ ...m, to_mobile: mask(m.to_mobile) }));
  res.json({ messages: rows });
});

app.get('/api/staff/access-log', requireRole('staff'), (req, res) => {
  const rows = db.prepare('SELECT * FROM access_log ORDER BY id DESC LIMIT 200').all();
  res.json({ log: rows });
});

app.get('/api/staff/ops-report', requireRole('staff'), (req, res) => {
  const byStatus = db.prepare('SELECT status, COUNT(*) c FROM outbox GROUP BY status').all();
  const orders = db.prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status').all();
  const views = db.prepare(`SELECT COUNT(*) c FROM access_log WHERE action LIKE 'report_view%'`).get().c;
  const downloads = db.prepare(`SELECT COUNT(*) c FROM access_log WHERE action='pdf_download'`).get().c;
  const linksSent = db.prepare(`SELECT COUNT(*) c FROM outbox WHERE kind LIKE 'report%'`).get().c;
  const openCallbacks = db.prepare(`SELECT COUNT(*) c FROM callback_tasks WHERE status='open'`).get().c;
  const openFlags = db.prepare(`SELECT COUNT(*) c FROM summary_flags WHERE status='open'`).get().c;
  const daily = db.prepare(
    `SELECT date(created_at) day, COUNT(*) messages FROM outbox GROUP BY date(created_at) ORDER BY day DESC LIMIT 14`).all();
  logAccess('staff', req.actor.id, 'ops_report_view', null, null, null);
  res.json({ byStatus, orders, views, downloads, linksSent, openCallbacks, openFlags, daily });
});

// ---------- doctor view (optional depth) ----------
app.post('/api/auth/doctor/request-otp', (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const known = db.prepare('SELECT COUNT(*) c FROM doctors WHERE mobile=?').get(mobile).c > 0;
  if (!known) return res.status(404).json({ error: 'not_registered' });
  const r = requestOTP(mobile, 'doctor');
  if (r.error) return res.status(429).json(r);
  res.json({ ok: true });
});
app.post('/api/auth/doctor/verify', (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const v = verifyOTP(mobile, String(req.body.code || ''), 'doctor');
  if (v.error) return res.status(400).json(v);
  const doc = db.prepare('SELECT * FROM doctors WHERE mobile=?').get(mobile);
  const token = createSession('doctor', doc.id, null, 12);
  setSessionCookie(res, token);
  logAccess('doctor', doc.id, 'login', 'doctor', doc.id, doc.full_name);
  res.json({ ok: true, name: doc.full_name });
});
app.get('/api/doctor/reports', requireRole('doctor'), (req, res) => {
  const rows = db.prepare(
    `SELECT o.id, o.order_code, o.status, o.signed_at, p.full_name patient_name, p.age, p.sex
     FROM orders o JOIN patients p ON p.id=o.patient_id
     WHERE o.doctor_id=? AND o.status!='processing' AND o.signed_at > datetime('now','-90 days')
     ORDER BY o.signed_at DESC`).all(req.actor.id);
  logAccess('doctor', req.actor.id, 'doctor_list_view', null, null, null);
  res.json({ reports: rows });
});
app.get('/api/doctor/orders/:id', requireRole('doctor'), (req, res) => {
  const order = db.prepare(
    `SELECT o.*, p.full_name patient_name, p.age, p.sex FROM orders o JOIN patients p ON p.id=o.patient_id
     WHERE o.id=? AND o.doctor_id=?`).get(req.params.id, req.actor.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const results = db.prepare('SELECT * FROM results WHERE order_id=?').all(order.id);
  logAccess('doctor', req.actor.id, 'report_view', 'order', order.id, order.order_code);
  res.json({ order, results });
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
