import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.DATA_DIR = '/tmp/lablink-sectest-' + Date.now();
process.env.BASE_URL = 'http://localhost:3000';

let app, db, signOffOrder, hashPassword;
const agent = () => request.agent(app);
const lastOTP = (mobile) =>
  db.prepare(`SELECT body FROM outbox WHERE to_mobile=? AND kind='otp' ORDER BY id DESC LIMIT 1`).get(mobile).body.match(/(\d{6})/)[1];

beforeAll(async () => {
  ({ app } = await import('../server/index.js'));
  ({ db } = await import('../server/db.js'));
  ({ signOffOrder } = await import('../server/lis.js'));
  ({ hashPassword } = await import('../server/crypto.js'));
  db.prepare('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)').run('Alice A', 40, 'F', '9700000001');
  db.prepare('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)').run('Bob B', 45, 'M', '9700000002');
  db.prepare('INSERT INTO doctors (full_name, mobile) VALUES (?,?)').run('Dr. Sec', '9100000098');
  db.prepare('INSERT INTO staff (username, password_hash, full_name, role) VALUES (?,?,?,?)').run('sec', hashPassword('pw123'), 'Sec Desk', 'frontdesk');
  db.prepare('INSERT INTO staff (username, password_hash, full_name, role) VALUES (?,?,?,?)').run('secpatho', hashPassword('pw123'), 'Sec Patho', 'pathologist');
  const pa = db.prepare('SELECT id FROM patients WHERE mobile=?').get('9700000001').id;
  const pb = db.prepare('SELECT id FROM patients WHERE mobile=?').get('9700000002').id;
  const secId = db.prepare("SELECT id FROM staff WHERE username='sec'").get().id;
  const insG = db.prepare("INSERT INTO patient_access (patient_id, mobile, kind, granted_by) VALUES (?,?,'contact',?)");
  insG.run(pa, '9700000001', secId);
  insG.run(pb, '9700000002', secId);
  const did = db.prepare('SELECT id FROM doctors WHERE mobile=?').get('9100000098').id;
  const insO = db.prepare('INSERT INTO orders (order_code, patient_id, doctor_id, status) VALUES (?,?,?,?)');
  insO.run('ORD-S1', pa, did, 'processing');
  insO.run('ORD-S2', pb, did, 'processing');
  const insR = db.prepare('INSERT INTO results (order_id, parameter, unit, value, reference_range, flag) VALUES (?,?,?,?,?,?)');
  const o1 = db.prepare('SELECT id FROM orders WHERE order_code=?').get('ORD-S1').id;
  const o2 = db.prepare('SELECT id FROM orders WHERE order_code=?').get('ORD-S2').id;
  insR.run(o1, 'Haemoglobin', 'g/dL', '10.0', '12.0-15.5', 'low');
  insR.run(o2, 'Haemoglobin', 'g/dL', '11.0', '12.0-15.5', 'low');
  await signOffOrder(o1, 'Dr. Sec', { type: 'staff', id: 1 });
  await signOffOrder(o2, 'Dr. Sec', { type: 'staff', id: 1 });
});

const login = async (a, mobile) => {
  await a.post('/api/auth/patient/request-otp').send({ mobile });
  await a.post('/api/auth/patient/verify').send({ mobile, code: lastOTP(mobile), consent: true });
};
const orderId = (code) => db.prepare('SELECT id FROM orders WHERE order_code=?').get(code).id;
const linkToken = (code) =>
  db.prepare('SELECT body FROM outbox WHERE body LIKE ? ORDER BY id DESC LIMIT 1').get(`%${code}%`).body.match(/\/r\/([A-Za-z0-9_-]+)/)[1];

describe('security review', () => {
  it('rejects unauthenticated access to patient, staff, and PDF routes', async () => {
    const a = agent();
    expect((await a.get('/api/patient/orders')).status).toBe(401);
    expect((await a.get(`/api/patient/orders/${orderId('ORD-S1')}`)).status).toBe(401);
    expect((await a.get(`/api/patient/orders/${orderId('ORD-S1')}/pdf`)).status).toBe(401);
    expect((await a.get('/api/staff/patients')).status).toBe(401);
    expect((await a.get('/api/staff/summary-sample')).status).toBe(401);
  });

  it('blocks IDOR: a patient session cannot read another mobile\'s order or PDF', async () => {
    const a = agent();
    await login(a, '9700000001'); // Alice
    expect((await a.get(`/api/patient/orders/${orderId('ORD-S1')}`)).status).toBe(200); // own order OK
    expect((await a.get(`/api/patient/orders/${orderId('ORD-S2')}`)).status).toBe(404); // Bob's order hidden
    expect((await a.get(`/api/patient/orders/${orderId('ORD-S2')}/pdf`)).status).toBe(404);
    expect((await a.get('/api/staff/patients')).status).toBe(403); // patient role cannot use staff routes
  });

  it('secure link requires OTP and scopes the session to one order', async () => {
    const a = agent();
    const tok = linkToken('ORD-S1');
    expect((await a.get(`/api/link/${tok}/report`)).status).toBe(401); // no OTP yet
    expect((await a.get(`/api/link/${tok}/pdf`)).status).toBe(401);
    await a.post(`/api/link/${tok}/request-otp`).send({});
    await a.post(`/api/link/${tok}/verify`).send({ code: lastOTP('9700000001') });
    expect((await a.get(`/api/link/${tok}/report`)).status).toBe(200);
    const pdf = await a.get(`/api/link/${tok}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('pdf');
    // the link-scoped session must NOT open the patient portal or another order's link
    expect((await a.get('/api/patient/orders')).status).toBe(403);
    expect((await a.get(`/api/link/${linkToken('ORD-S2')}/report`)).status).toBe(401);
  });

  it('unknown or expired link tokens return 404, never data', async () => {
    const a = agent();
    expect((await a.get('/api/link/deadbeefdeadbeef/report')).status).toBe(404);
    db.prepare(`UPDATE report_links SET expires_at='2020-01-01 00:00:00' WHERE order_id=?`).run(orderId('ORD-S2'));
    expect((await a.get(`/api/link/${linkToken('ORD-S2')}/report`)).status).toBe(410); // expired -> OTP verify impossible below
    const r = await a.post(`/api/link/${linkToken('ORD-S2')}/request-otp`).send({});
    expect([404, 410]).toContain(r.status);
  });

  it('locks OTP after 5 wrong attempts and rate-limits requests', async () => {
    const a = agent();
    const tok = linkToken('ORD-S1');
    await a.post(`/api/link/${tok}/request-otp`).send({});
    for (let i = 0; i < 5; i++) await a.post(`/api/link/${tok}/verify`).send({ code: '000000' });
    const r6 = await a.post(`/api/link/${tok}/verify`).send({ code: lastOTP('9700000001') });
    expect([400, 429]).toContain(r6.status); // even the RIGHT code is now rejected
    const mob = '9700000099';
    db.prepare('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)').run('Rate Lim', 30, 'M', mob);
    const rp = db.prepare('SELECT id FROM patients WHERE mobile=?').get(mob).id;
    db.prepare("INSERT INTO patient_access (patient_id, mobile, kind, granted_by) VALUES (?,?,'contact',?)").run(rp, mob, db.prepare("SELECT id FROM staff WHERE username='sec'").get().id);
    const b = agent();
    await b.post('/api/auth/patient/request-otp').send({ mobile: mob });
    await b.post('/api/auth/patient/request-otp').send({ mobile: mob });
    await b.post('/api/auth/patient/request-otp').send({ mobile: mob });
    const r4 = await b.post('/api/auth/patient/request-otp').send({ mobile: mob });
    expect(r4.status).toBe(429);
  });

  it('sign-off is idempotent and staff login rejects bad passwords', async () => {
    const again = await signOffOrder(orderId('ORD-S1'), 'Dr. Sec', { type: 'staff', id: 1 });
    expect(again.error).toBe('already_signed');
    const a = agent();
    expect((await a.post('/api/auth/staff/login').send({ username: 'sec', password: 'wrong' })).status).toBe(401);
    expect((await a.post('/api/auth/staff/login').send({ username: 'sec', password: 'pw123' })).status).toBe(200);
  });

  it('weekly sample endpoint returns at most 50 rows and records reviews', async () => {
    const a = agent();
    await a.post('/api/auth/staff/login').send({ username: 'sec', password: 'pw123' });
    // weekly AI review is the pathologist's job: front desk is denied
    expect((await a.get('/api/staff/summary-sample')).status).toBe(403);
    await a.post('/api/auth/staff/login').send({ username: 'secpatho', password: 'pw123' });
    const r = await a.get('/api/staff/summary-sample');
    expect(r.status).toBe(200);
    expect(r.body.sample.length).toBeLessThanOrEqual(50);
    if (r.body.sample.length) {
      const id = r.body.sample[0].id;
      expect((await a.post(`/api/staff/summary-sample/${id}/review`).send({ verdict: 'ok' })).status).toBe(200);
      expect((await a.post(`/api/staff/summary-sample/${id}/review`).send({ verdict: 'bogus' })).status).toBe(400);
    }
  });
});
