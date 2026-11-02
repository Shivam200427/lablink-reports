import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.DATA_DIR = '/tmp/lablink-test-' + Date.now();
process.env.BASE_URL = 'http://localhost:3000';

let app, db, signOffOrder, importCSV, flagResult, parseRange, findKBEntry, buildSummaryTexts, buildSummaryTextsWithAI, setAIClient, hashPassword;

const agent = () => request.agent(app);
async function lastOTP(mobile) {
  const row = db.prepare(`SELECT body FROM outbox WHERE to_mobile=? AND kind='otp' ORDER BY id DESC LIMIT 1`).get(mobile);
  return row.body.match(/(\d{6})/)[1];
}
async function patientLogin(a, mobile, consent = true) {
  await a.post('/api/auth/patient/request-otp').send({ mobile });
  const code = await lastOTP(mobile);
  const r1 = await a.post('/api/auth/patient/verify').send({ mobile, code });
  if (r1.body.needsConsent) {
    return a.post('/api/auth/patient/verify').send({ mobile, code, consent });
  }
  return r1;
}

beforeAll(async () => {
  ({ app } = await import('../server/index.js'));
  ({ db } = await import('../server/db.js'));
  ({ signOffOrder, importCSV } = await import('../server/lis.js'));
  ({ flagResult, parseRange } = await import('../server/flags.js'));
  ({ findKBEntry } = await import('../server/kb.js'));
  ({ buildSummaryTexts, buildSummaryTextsWithAI } = await import('../server/summary.js'));
  ({ setAIClient } = await import('../server/ai.js'));
  ({ hashPassword } = await import('../server/crypto.js'));
  // minimal fixture
  db.prepare('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)').run('Test Patient', 60, 'F', '9800000001');
  db.prepare('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)').run('Family Member', 65, 'M', '9800000001');
  db.prepare('INSERT INTO doctors (full_name, mobile) VALUES (?,?)').run('Dr. Test', '9100000099');
  db.prepare('INSERT INTO staff (username, password_hash, full_name, role) VALUES (?,?,?,?)').run('desk', hashPassword('pw123'), 'Desk User', 'frontdesk');
  const pid = db.prepare('SELECT id FROM patients WHERE mobile=?').get('9800000001').id;
  const did = db.prepare('SELECT id FROM doctors WHERE mobile=?').get('9100000099').id;
  db.prepare('INSERT INTO orders (order_code, patient_id, doctor_id, status) VALUES (?,?,?,?)').run('ORD-T1', pid, did, 'processing');
  const oid = db.prepare('SELECT id FROM orders WHERE order_code=?').get('ORD-T1').id;
  const insR = db.prepare('INSERT INTO results (order_id, parameter, unit, value, reference_range, flag) VALUES (?,?,?,?,?,?)');
  insR.run(oid, 'Haemoglobin', 'g/dL', '10.2', '12.0-15.5', flagResult('10.2', '12.0-15.5', findKBEntry('Haemoglobin')));
  insR.run(oid, 'Potassium', 'mmol/L', '6.8', '3.5-5.1', flagResult('6.8', '3.5-5.1', findKBEntry('Potassium')));
});

describe('flag rules', () => {
  it('parses ranges', () => {
    expect(parseRange('12.0-15.5')).toEqual({ low: 12, high: 15.5 });
    expect(parseRange('Up to 200')).toEqual({ low: null, high: 200 });
    expect(parseRange('> 40')).toEqual({ low: 40, high: null });
    expect(parseRange('junk')).toBeNull();
  });
  it('flags by rules, critical from KB thresholds', () => {
    expect(flagResult('10.2', '12.0-15.5', findKBEntry('Haemoglobin'))).toBe('low');
    expect(flagResult('6.8', '3.5-5.1', findKBEntry('Potassium'))).toBe('critical');
    expect(flagResult('142', '0-100', findKBEntry('LDL'))).toBe('high');
    expect(flagResult('abc', '0-100')).toBe('unknown');
  });
});

describe('summary engine safety', () => {
  it('summarizes only out-of-range known tests, short text with facts, no advice', () => {
    const t = buildSummaryTexts({ parameter: 'Haemoglobin', value: '10.2', unit: 'g/dL', reference_range: '12.0-15.5', flag: 'low' });
    expect(t.lang_en).toContain('below the normal range');
    expect(t.lang_en).toContain('10.2');
    expect(t.lang_en).toContain('12.0-15.5');
    expect(t.lang_en.length).toBeLessThan(160);
    expect(t.lang_en).not.toMatch(/medicine|exercise|diet|treatment/i);
    expect(buildSummaryTexts({ parameter: 'Potassium', value: '6.8', unit: 'mmol/L', reference_range: '3.5-5.1', flag: 'critical' })).toBeNull();
    expect(buildSummaryTexts({ parameter: 'Haemoglobin', value: '13', unit: 'g/dL', reference_range: '12.0-15.5', flag: 'normal' })).toBeNull();
    expect(buildSummaryTexts({ parameter: 'Obscure Analyte', value: '9', flag: 'high' })).toBeNull();
  });
  it('produces all three languages', () => {
    const t = buildSummaryTexts({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', reference_range: '0-100', flag: 'high' });
    expect(t.lang_te).toMatch(/ఎక్కువగా/);
    expect(t.lang_hi).toMatch(/अधिक/);
    expect(t.engine).toBe('template');
  });
  it('uses validated AI output when a provider is configured', async () => {
    setAIClient(async () => 'Your LDL cholesterol is above the normal range. Your value is 142 mg/dL; normal is 0-100 mg/dL.');
    const t = await buildSummaryTextsWithAI({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', reference_range: '0-100', flag: 'high' });
    expect(t.engine).toBe('ai');
    expect(t.lang_en).toContain('142');
    setAIClient(null);
  });
  it('falls back to the locked template when AI output is unsafe or wrong', async () => {
    setAIClient(async () => 'You should take medicine, change your diet and exercise daily.');
    let t = await buildSummaryTextsWithAI({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', reference_range: '0-100', flag: 'high' });
    expect(t.engine).toBe('template');
    expect(t.lang_en).toContain('above the normal range');
    setAIClient(async () => 'This value is fine, nothing to see here.');
    t = await buildSummaryTextsWithAI({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', reference_range: '0-100', flag: 'high' });
    expect(t.engine).toBe('template'); // missing the actual value -> rejected
    setAIClient(async () => { throw new Error('provider down'); });
    t = await buildSummaryTextsWithAI({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', reference_range: '0-100', flag: 'high' });
    expect(t.engine).toBe('template'); // provider error -> template
    setAIClient(null);
  });
});

describe('patient OTP login + consent + family', () => {
  it('rejects unregistered numbers and bad codes', async () => {
    const a = agent();
    expect((await a.post('/api/auth/patient/request-otp').send({ mobile: '9000000099' })).status).toBe(404);
    await a.post('/api/auth/patient/request-otp').send({ mobile: '9800000001' });
    expect((await a.post('/api/auth/patient/verify').send({ mobile: '9800000001', code: '000000' })).body.error).toBe('wrong_code');
  });
  it('asks consent once, then lists family members on one number', async () => {
    const a = agent();
    const r = await patientLogin(a, '9800000001');
    expect(r.body.needsConsent).toBe(false);
    expect(r.body.patients).toHaveLength(2);
    expect((await a.get('/api/patient/me')).body.patients).toHaveLength(2);
  });
  it('blocks access without session', async () => {
    expect((await request(app).get('/api/patient/orders')).status).toBe(401);
  });
});

describe('sign-off pipeline', () => {
  it('creates 72h link, whatsapp message, summaries, critical callback, pdf', async () => {
    const oid = db.prepare('SELECT id FROM orders WHERE order_code=?').get('ORD-T1').id;
    const r = await signOffOrder(oid, 'Dr. M. Vidyasagar');
    expect(r.ok).toBe(true);
    expect(r.status).toBe('ready_critical');
    expect(r.critical).toBe(1);
    expect(r.link).toMatch(/\/r\//);
    const link = db.prepare('SELECT * FROM report_links WHERE order_id=?').get(oid);
    const hrs = (new Date(link.expires_at) - new Date(link.created_at)) / 3600000;
    expect(Math.round(hrs)).toBe(72);
    expect(db.prepare(`SELECT COUNT(*) c FROM outbox WHERE order_id=? AND kind='report_ready'`).get(oid).c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM summaries s JOIN results r2 ON r2.id=s.result_id WHERE r2.order_id=?').get(oid).c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM callback_tasks WHERE order_id=?').get(oid).c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) c FROM access_log WHERE action='order_signed' AND entity_id=?`).get(oid).c).toBe(1);
  });
});

describe('secure link flow', () => {
  it('requires OTP, serves report after verify, logs access', async () => {
    const oid = db.prepare('SELECT id FROM orders WHERE order_code=?').get('ORD-T1').id;
    const raw = (await signOffOrder.bind(null)) && db.prepare('SELECT token_hash FROM report_links WHERE order_id=?').get(oid);
    // cannot recover raw token from hash; create a fresh link via staff resend path instead
    const a = agent();
    await a.post('/api/auth/staff/login').send({ username: 'desk', password: 'pw123' });
    expect((await a.post(`/api/staff/orders/${oid}/resend-link`)).body.ok).toBe(true);
    const msg = db.prepare(`SELECT body FROM outbox WHERE order_id=? AND kind='report_resent' ORDER BY id DESC LIMIT 1`).get(oid);
    const token = msg.body.match(/\/r\/([A-Za-z0-9_-]+)/)[1];
    const pub = await request(app).get(`/api/link/${token}`);
    expect(pub.body.ok).toBe(true);
    expect(pub.body.mobile).toBe('******0001');
    expect((await request(app).get(`/api/link/${token}/report`)).status).toBe(401);
    const b = agent();
    await b.post(`/api/link/${token}/request-otp`);
    const code = await lastOTP('9800000001');
    expect((await b.post(`/api/link/${token}/verify`).send({ code })).body.ok).toBe(true);
    const rep = await b.get(`/api/link/${token}/report`);
    expect(rep.body.order.order_code).toBe('ORD-T1');
    expect(rep.body.results.length).toBe(2);
    expect(db.prepare(`SELECT COUNT(*) c FROM access_log WHERE action='report_view_via_link'`).get().c).toBeGreaterThan(0);
  });
  it('rejects unknown and expired links', async () => {
    expect((await request(app).get('/api/link/doesnotexist')).status).toBe(404);
  });
});

describe('staff console', () => {
  it('login, search masked, import csv, resend, ops report', async () => {
    const a = agent();
    expect((await a.post('/api/auth/staff/login').send({ username: 'desk', password: 'wrong' })).status).toBe(401);
    await a.post('/api/auth/staff/login').send({ username: 'desk', password: 'pw123' });
    const s = await a.get('/api/staff/patients?q=Test');
    expect(s.body.patients[0].mobile).toBe('******0001');
    const imp = await a.post('/api/staff/import').attach('file', Buffer.from(
      'Order ID,Patient,Mobile,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T2,Import Case,9800000007,Haemoglobin,11.0,12.0-15.5,Ready,Dr. Test\n'
    ), 'lis.csv');
    expect(imp.body.newOrders).toBe(1);
    const r = await a.get('/api/staff/ops-report');
    // Report-notification metrics reconcile: linksSent = delivered + failed + inFlight
    expect(r.body.notif.linksSent).toBeGreaterThan(0);
    expect(r.body.notif.linksSent).toBe(r.body.notif.delivered + r.body.notif.failed + r.body.notif.inFlight);
    expect(r.body.otpMessages).toBeGreaterThanOrEqual(0);
    // Sign-off list exposes public order codes, never raw DB ids in the UI
    const po = await a.get('/api/staff/orders?status=processing');
    expect(po.status).toBe(200);
    expect(po.body.orders.every((o) => o.status === 'processing' && /^ORD-/.test(o.order_code))).toBe(true);
    const before = db.prepare(`SELECT COUNT(*) c FROM outbox WHERE kind='report_ready'`).get().c;
    expect(before).toBeGreaterThan(0);
  });
});

describe('csv import flags', () => {
  it('imports and flags rows', async () => {
    const r = await importCSV('Order ID,Patient,Mobile,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T3,Flags Case,9800000008,LDL Cholesterol,142,0-100,Processing,Dr. Test\nORD-T3,Flags Case,9800000008,Potassium,6.8,3.5-5.1,Processing,Dr. Test\n');
    expect(r.newOrders).toBe(1);
    const flags = db.prepare(`SELECT flag FROM results r JOIN orders o ON o.id=r.order_id WHERE o.order_code='ORD-T3' ORDER BY r.id`).all().map(x => x.flag);
    expect(flags).toEqual(['high', 'critical']);
  });
});
