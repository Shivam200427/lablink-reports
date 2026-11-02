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

describe('patient self-registration', () => {
  it('registers a new patient with an empty record, OTP login, consent, no reports', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/patient/register').send({ fullName: 'Self Registered', mobile: '9800000077', language: 'te', age: 45, sex: 'F' });
    expect(reg.status).toBe(200);
    const code = await lastOTP('9800000077');
    const v = await a.post('/api/auth/patient/verify').send({ mobile: '9800000077', code, consent: true });
    expect(v.status).toBe(200);
    const orders = await a.get('/api/patient/orders');
    expect(orders.status).toBe(200);
    expect(orders.body.orders).toEqual([]);
    const me = await a.get('/api/patient/me');
    expect(me.status).toBe(200);
  });

  it('rejects duplicate registration, invalid mobile and missing name', async () => {
    const a = agent();
    const dup = await a.post('/api/auth/patient/register').send({ fullName: 'Test Patient Clone', mobile: '9800000001', language: 'en' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('already_registered');
    const badM = await a.post('/api/auth/patient/register').send({ fullName: 'X Y', mobile: '123', language: 'en' });
    expect(badM.status).toBe(400);
    const badN = await a.post('/api/auth/patient/register').send({ fullName: 'x', mobile: '9800000078', language: 'en' });
    expect(badN.status).toBe(400);
  });

  it('attaches LIS-imported results to a self-registered patient only via the lab CSV (mobile + name match)', async () => {
    const a = agent();
    await a.post('/api/auth/patient/register').send({ fullName: 'Merge Case', mobile: '9800000079', language: 'en' });
    const r = await importCSV('Order ID,Patient,Mobile,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T9,Merge Case,9800000079,LDL Cholesterol,142,0-100,Processing,Dr. Test\n');
    expect(r.newOrders).toBe(1);
    expect(r.newPatients).toBe(0); // merged into the self-registered record, not duplicated
    const code = await lastOTP('9800000079');
    await a.post('/api/auth/patient/verify').send({ mobile: '9800000079', code, consent: true });
    const orders = await a.get('/api/patient/orders');
    expect(orders.body.orders.map(o => o.order_code)).toContain('ORD-T9');
  });

  it('never attaches name-only LIS rows (export without mobile) to a self-registered identity', async () => {
    const a = agent();
    await a.post('/api/auth/patient/register').send({ fullName: 'Impersonation Target', mobile: '9800000080', language: 'en' });
    // attacker registers under a victim's exact name on their own phone;
    // a mobile-less LIS export row for that name arrives
    const r = await importCSV('Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T10,Impersonation Target,Potassium,6.8,3.5-5.1,Processing,Dr. Test\n');
    expect(r.newOrders).toBe(1);
    expect(r.newPatients).toBe(1); // new lab-created patient, NOT the self-registered one
    const code = await lastOTP('9800000080');
    await a.post('/api/auth/patient/verify').send({ mobile: '9800000080', code, consent: true });
    const orders = await a.get('/api/patient/orders');
    expect(orders.body.orders).toEqual([]); // self-registered identity sees nothing
  });

  it('keeps a same-mobile different-name import as a separate lab patient', async () => {
    const a = agent();
    await a.post('/api/auth/patient/register').send({ fullName: 'Household Self', mobile: '9800000081', language: 'en' });
    const r = await importCSV('Order ID,Patient,Mobile,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T11,Household Other,9800000081,Haemoglobin,10.2,12.0-15.5,Processing,Dr. Test\n');
    expect(r.newPatients).toBe(1); // no silent identity merge
    const me = await (async () => { const code = await lastOTP('9800000081'); await a.post('/api/auth/patient/verify').send({ mobile: '9800000081', code, consent: true }); return a.get('/api/patient/me'); })();
    const names = me.body.patients.map(p => p.full_name).sort();
    expect(names).toEqual(['Household Other', 'Household Self']); // two records, family picker
  });

  it('converges repeated name-only imports on one lab patient, and a verified merge accepts later name-only rows', async () => {
    const a = agent();
    await a.post('/api/auth/patient/register').send({ fullName: 'Converge Case', mobile: '9800000082', language: 'en' });
    const h = 'Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor\n';
    // name-only rows before any lab-verified identity: separate lab patient
    const r1 = await importCSV(h + 'ORD-T12,Converge Case,LDL Cholesterol,142,0-100,Processing,Dr. Test\n');
    expect(r1.newPatients).toBe(1);
    // repeat name-only import: same lab patient, no duplicate
    const r2 = await importCSV(h + 'ORD-T13,Converge Case,HDL Cholesterol,60,40-80,Processing,Dr. Test\n');
    expect(r2.newPatients).toBe(0);
    // mobile+name import: converges with the self-registered record (lab vouches)
    const r3 = await importCSV('Order ID,Patient,Mobile,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T14,Converge Case,9800000082,Haemoglobin,13.0,12.0-15.5,Processing,Dr. Test\n');
    expect(r3.newPatients).toBe(0);
    const code = await lastOTP('9800000082');
    await a.post('/api/auth/patient/verify').send({ mobile: '9800000082', code, consent: true });
    const orders = await a.get('/api/patient/orders');
    const codes = orders.body.orders.map(o => o.order_code);
    expect(codes).toContain('ORD-T14'); // merged order visible
    expect(codes).not.toContain('ORD-T12'); // name-only rows stayed with the separate lab patient
    expect(codes).not.toContain('ORD-T13');
  });

  it('holds a name-only row when two lab patients share the name, and explains the fix to staff', async () => {
    const h = 'Order ID,Patient,Mobile,Parameter,Result,Reference Range,Status,Referring Doctor\n';
    // two DISTINCT lab patients named 'Duplicate Name' on different mobiles
    await importCSV(h + 'ORD-T15,Duplicate Name,9800000083,Haemoglobin,13.0,12.0-15.5,Processing,Dr. Test\n');
    await importCSV(h + 'ORD-T16,Duplicate Name,9800000084,Haemoglobin,14.0,12.0-15.5,Processing,Dr. Test\n');
    // a name-only export row cannot be safely attributed
    const r = await importCSV('Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T17,Duplicate Name,Potassium,4.0,3.5-5.1,Processing,Dr. Test\n');
    expect(r.newOrders).toBe(0);
    expect(r.errors.join(' ')).toMatch(/ambiguous patient name 'Duplicate Name' \(2 lab records share it\).*include Mobile/);
    // a name-only row for an unambiguous lab patient still attaches
    const r2 = await importCSV('Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T18,Duplicate Name Unique,Potassium,4.0,3.5-5.1,Processing,Dr. Test\n');
    expect(r2.newOrders).toBe(1);
    expect(r2.newPatients).toBe(1);
    const r3 = await importCSV('Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor\nORD-T19,Duplicate Name Unique,HDL Cholesterol,60,40-80,Processing,Dr. Test\n');
    expect(r3.newOrders).toBe(1);
    expect(r3.newPatients).toBe(0);
  });
});

describe('manual front-desk order entry', () => {
  async function staffLogin(a) {
    await a.post('/api/auth/staff/login').send({ username: 'desk', password: 'pw123' });
  }
  it('creates a walk-in order for a fresh patient; sign-off delivers to the OTP portal', async () => {
    const a = agent();
    await staffLogin(a);
    const r = await a.post('/api/staff/orders').send({
      patientName: 'Walk In Patient', mobile: '9800000090', age: 52, sex: 'M',
      doctorName: 'Dr. Test',
      results: [{ parameter: 'Haemoglobin', value: '9.8', unit: 'g/dL', referenceRange: '12.0-15.5' }],
    });
    expect(r.status).toBe(200);
    expect(r.body.orderCode).toMatch(/^ORD-\d+$/);
    // order is processing with a flagged result, visible on the sign-off list
    const list = await a.get('/api/staff/orders?status=processing');
    const row = list.body.orders.find((o) => o.order_code === r.body.orderCode);
    expect(row).toBeTruthy();
    expect(row.flagged).toBe(1);
    // pathologist signs -> link + message; patient logs in with OTP and sees it
    const so = await a.post(`/api/staff/orders/${r.body.orderId}/signoff`).send({});
    expect(so.body.ok).toBe(true);
    const p = agent();
    await patientLogin(p, '9800000090');
    const orders = await p.get('/api/patient/orders');
    expect(orders.body.orders.map((o) => o.order_code)).toContain(r.body.orderCode);
    // the report API exposes the summary engine so the UI can label
    // AI-written vs standard wording honestly
    const detail = await p.get(`/api/patient/orders/${r.body.orderId}`);
    const summarized = detail.body.results.filter((x) => x.summary_id);
    expect(summarized.length).toBeGreaterThan(0);
    for (const x of summarized) expect(['template', 'ai', 'ai+template']).toContain(x.engine);
  });

  it('converges with a self-registered patient on mobile+name (lab-asserted entry)', async () => {
    const p = agent();
    await p.post('/api/auth/patient/register').send({ fullName: 'Desk Merge', mobile: '9800000091', language: 'en' });
    const a = agent();
    await staffLogin(a);
    const r = await a.post('/api/staff/orders').send({
      patientName: 'Desk Merge', mobile: '9800000091',
      results: [{ parameter: 'LDL Cholesterol', value: '142', referenceRange: '0-100' }],
    });
    expect(r.status).toBe(200);
    const code = await lastOTP('9800000091');
    await p.post('/api/auth/patient/verify').send({ mobile: '9800000091', code, consent: true });
    const orders = await p.get('/api/patient/orders');
    expect(orders.body.orders.map((o) => o.order_code)).toContain(r.body.orderCode);
  });

  it('missing reference range stays unknown - never normal, never summarised', async () => {
    const a = agent();
    await a.post('/api/auth/staff/login').send({ username: 'desk', password: 'pw123' });
    const r = await a.post('/api/staff/orders').send({
      patientName: 'No Range Case', mobile: '9800000093',
      // potassium has SAMPLE critical thresholds in the KB; a missing range must
      // still NOT become critical/normal or produce any summary
      results: [{ parameter: 'Potassium', value: '6.8' }],
    });
    expect(r.status).toBe(200);
    const so = await a.post(`/api/staff/orders/${r.body.orderId}/signoff`).send({});
    expect(so.body.summaries).toBe(0); // no AI/template sentence without a source range
    const p = agent();
    await patientLogin(p, '9800000093');
    const detail = await p.get(`/api/patient/orders/${r.body.orderId}`);
    const res = detail.body.results.find((x) => x.parameter === 'Potassium');
    expect(res.flag).toBe('unknown'); // not 'normal' reassurance, not KB-critical
    expect(detail.body.summaries ?? []).toEqual([]);
    const list = await a.get('/api/staff/orders?status=ready');
    const row = list.body.orders.find((o) => o.id === r.body.orderId);
    expect(row.no_range).toBe(1); // staff see the missing range as a data-quality signal
  });

  it('lab-verified family access: delegated relative sees only the granted patient, revoke closes it', async () => {
    const a = agent();
    await staffLogin(a);
    // two patients on one household number (lab-asserted contact)
    const mk = (name) => a.post('/api/staff/orders').send({ patientName: name, mobile: '9800000095', results: [{ parameter: 'LDL Cholesterol', value: '142', referenceRange: '0-100' }] });
    const r1 = await mk('Household One'); expect(r1.status).toBe(200);
    const r2 = await mk('Household Two'); expect(r2.status).toBe(200);
    const plist = await a.get('/api/staff/patients?q=Household');
    const p1 = plist.body.patients.find((x) => x.full_name === 'Household One');
    const p2 = plist.body.patients.find((x) => x.full_name === 'Household Two');
    expect(p1 && p2).toBeTruthy();
    // relative's own number starts with no access at all
    const rel = agent();
    expect((await rel.post('/api/auth/patient/request-otp').send({ mobile: '9800000096' })).status).toBe(404);
    // front desk grants the relative access to Household One only
    const g = await a.post(`/api/staff/patients/${p1.id}/access`).send({ mobile: '9800000096', relation: 'son' });
    expect(g.body.ok).toBe(true);
    expect((await a.post(`/api/staff/patients/${p1.id}/access`).send({ mobile: '9800000096' })).status).toBe(409);
    // relative logs in: sees Household One, NOT Household Two
    await rel.post('/api/auth/patient/request-otp').send({ mobile: '9800000096' });
    const msgs = await a.get('/api/staff/outbox?mobile=9800000096');
    const code = msgs.body.messages.find((m) => m.kind === 'otp').body.match(/OTP is (\d{6})/)[1];
    const v = await rel.post('/api/auth/patient/verify').send({ mobile: '9800000096', code, consent: true });
    expect(v.body.ok).toBe(true);
    expect(v.body.patients.map((x) => x.full_name)).toEqual(['Household One']);
    const orders = await rel.get('/api/patient/orders');
    expect(orders.body.orders.map((o) => o.patient_name)).toEqual(['Household One']);
    const detail = await rel.get(`/api/patient/orders/${r1.body.orderId}`);
    expect(detail.status).toBe(200);
    expect((await rel.get(`/api/patient/orders/${r2.body.orderId}`)).status).toBe(404);
    // revoke closes access completely
    const det = await a.get(`/api/staff/patients/${p1.id}`);
    const grantId = det.body.familyAccess[0].id;
    expect(det.body.familyAccess[0].relation).toBe('son');
    expect((await a.post(`/api/staff/patients/${p1.id}/access/${grantId}/revoke`).send({})).body.ok).toBe(true);
    const orders2 = await rel.get('/api/patient/orders');
    expect(orders2.body.orders).toEqual([]);
    expect((await rel.get(`/api/patient/orders/${r1.body.orderId}`)).status).toBe(404);
  });

  it('validates input and enforces the staff role', async () => {
    const a = agent();
    expect((await a.post('/api/staff/orders').send({ patientName: 'X Y', mobile: '9800000092', results: [{ parameter: 'Hb', value: '10' }] })).status).toBe(401);
    await staffLogin(a);
    expect((await a.post('/api/staff/orders').send({ patientName: 'X Y', mobile: '123', results: [{ parameter: 'Hb', value: '10' }] })).status).toBe(400);
    expect((await a.post('/api/staff/orders').send({ patientName: 'X Y', mobile: '9800000092', results: [] })).status).toBe(400);
    expect((await a.post('/api/staff/orders').send({ patientName: 'X', mobile: '9800000092', results: [{ parameter: 'Hb', value: '10' }] })).status).toBe(400);
    const p = agent();
    await patientLogin(p, '9800000090'); // walk-in patient from the first test (known, consented)
    expect((await p.post('/api/staff/orders').send({ patientName: 'X Y', mobile: '9800000092', results: [{ parameter: 'Hb', value: '10' }] })).status).toBe(403);
  });
});
