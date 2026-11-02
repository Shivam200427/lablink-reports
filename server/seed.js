// Seed runs offline: demo summaries use the locked templates, never the
// network. Deploy startup must bind the port in seconds, not wait on a
// third-party AI endpoint.
process.env.AI_OFF = '1';

// Seed with realistic SYNTHETIC sample data only. No real patients.
import { initDB, get, run, insert, logAccess } from './db.js';
import { hashPassword } from './crypto.js';
import { flagResult } from './flags.js';
import { findKBEntry } from './kb.js';
import { signOffOrder } from './lis.js';

const insPatient = 'INSERT INTO patients (full_name, age, sex, mobile, preferred_language) VALUES (?,?,?,?,?)';
const insDoc = 'INSERT INTO doctors (full_name, mobile) VALUES (?,?)';
const insStaff = 'INSERT INTO staff (username, password_hash, full_name, role) VALUES (?,?,?,?)';
const insOrder = 'INSERT INTO orders (order_code, patient_id, doctor_id, status, ordered_at) VALUES (?,?,?,?,?)';
const insResult = 'INSERT INTO results (order_id, parameter, unit, value, reference_range, flag) VALUES (?,?,?,?,?,?)';

async function addOrder(code, patientId, doctorId, results, daysAgo = 0) {
  const orderedAt = new Date(Date.now() - daysAgo * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const id = await insert(insOrder, [code, patientId, doctorId, 'processing', orderedAt]);
  for (const [parameter, unit, value, range] of results) {
    await run(insResult, [id, parameter, unit, String(value), range, flagResult(value, range, findKBEntry(parameter))]);
  }
  return id;
}

const CBC = (hb, rbc, wbc, plt, pcv, mcv, esr) => [
  ['Haemoglobin', 'g/dL', hb, '12.0-15.5'], ['RBC Count', 'mill/µL', rbc, '4.2-5.4'],
  ['WBC Count', '/µL', wbc, '4000-11000'], ['Platelet Count', '/µL', plt, '150000-450000'],
  ['PCV', '%', pcv, '36-48'], ['MCV', 'fL', mcv, '80-100'], ['ESR', 'mm/hr', esr, '0-20'],
];
const LIPID = (tc, ldl, hdl, tg) => [
  ['Total Cholesterol', 'mg/dL', tc, '0-200'], ['LDL Cholesterol', 'mg/dL', ldl, '0-100'],
  ['HDL Cholesterol', 'mg/dL', hdl, '40-60'], ['Triglycerides', 'mg/dL', tg, '0-150'],
];
const KFT = (cr, urea, ua, na, k) => [
  ['Creatinine', 'mg/dL', cr, '0.6-1.3'], ['Blood Urea', 'mg/dL', urea, '15-40'],
  ['Uric Acid', 'mg/dL', ua, '3.5-7.2'], ['Sodium', 'mmol/L', na, '136-145'],
  ['Potassium', 'mmol/L', k, '3.5-5.1'],
];
const LFT = (bili, sgot, sgpt, alp, tp, alb) => [
  ['Bilirubin Total', 'mg/dL', bili, '0.2-1.2'], ['SGOT (AST)', 'U/L', sgot, '5-40'],
  ['SGPT (ALT)', 'U/L', sgpt, '7-56'], ['ALP', 'U/L', alp, '44-147'],
  ['Total Protein', 'g/dL', tp, '6.4-8.3'], ['Albumin', 'g/dL', alb, '3.5-5.2'],
];
const DIAB = (fbs, a1c) => [['Fasting Blood Sugar', 'mg/dL', fbs, '70-100'], ['HbA1c', '%', a1c, '4.0-5.6']];
const THY = (tsh) => [['TSH', 'µIU/mL', tsh, '0.4-4.0']];
const VIT = (d, b12) => [['Vitamin D', 'ng/mL', d, '30-100'], ['Vitamin B12', 'pg/mL', b12, '200-900']];

async function main() {
  await initDB();

  // Restart-safe: seed only an EMPTY database. A service restart must never
  // wipe live data. Pass --wipe to force a fresh demo dataset.
  const forceWipe = process.argv.includes('--wipe');
  const alreadySeeded = (await get('SELECT COUNT(*) c FROM patients')).c > 0;
  if (alreadySeeded && !forceWipe) {
    console.log('seed: database already populated, leaving data untouched');
    return;
  }
  if (forceWipe) {
    for (const t of ['summary_flags','summaries','callback_tasks','access_log','outbox','sessions','otps','report_links','results','orders','patient_merges','patient_access','doctors','staff','patients'])
      await run(`DELETE FROM ${t}`);
  }

  const P = (name, age, sex, mobile, lang) => insert(insPatient, [name, age, sex, mobile, lang]);
  const lakshmi = await P('Lakshmi Prasanna K', 62, 'F', '9000000001', 'te');
  const ramesh = await P('Ramesh K', 68, 'M', '9000000001', 'te');            // same family number
  const venkata = await P('Venkata Rao M', 55, 'M', '9000000002', 'te');
  const farzana = await P('Farzana Begum', 47, 'F', '9000000003', 'hi');
  const srinivas = await P('Srinivas Rao', 60, 'M', '9000000004', 'te');
  const padma = await P('Padma Srinivas', 55, 'F', '9000000004', 'te');      // same family number
  const anitha = await P('Anitha Devi', 34, 'F', '9000000005', 'en');
  const rafi = await P('Mohammed Rafi', 41, 'M', '9000000006', 'hi');
  const koteswara = await P('Koteswara Rao', 70, 'M', '9000000007', 'te');
  const sunitha = await P('Sunitha Varma', 28, 'F', '9000000008', 'en');
  const swamy = await P('Narasimha Swamy', 66, 'M', '9000000009', 'te');
  const joseph = await P('Joseph Raj', 38, 'M', '9000000010', 'en');

  const drRamanaiah = await insert(insDoc, ['Dr. S. Ramanaiah', '9100000001']);
  const drAnitha = await insert(insDoc, ['Dr. P. Anitha', '9100000002']);
  const drSuresh = await insert(insDoc, ['Dr. K. Suresh', '9100000003']);

  await run(insStaff, ['frontdesk', hashPassword('Lab@2026'), 'K. Bhavani', 'frontdesk']);
  await run(insStaff, ['ops', hashPassword('Ops@2026'), 'G. Prasad (Operations Head)', 'ops']);
  await run(insStaff, ['patho', hashPassword('Patho@2026'), 'Dr. M. Vidyasagar (Pathologist)', 'pathologist']);

  // Fixture grants: seeded patients stand in for lab-registered patients whose
  // contact numbers were verified when the lab registered them, so each holds
  // a 'contact' grant attributed to the front desk. Records created AFTER the
  // grant policy (imports, unverified walk-ins) get no automatic grants.
  const deskId = (await get("SELECT id FROM staff WHERE username='frontdesk'")).id;
  for (const pid of [lakshmi, ramesh, venkata, farzana, srinivas, padma, anitha, rafi, koteswara, sunitha, swamy, joseph]) {
    const mob = (await get('SELECT mobile FROM patients WHERE id=?', [pid])).mobile;
    await insert("INSERT INTO patient_access (patient_id, mobile, kind, granted_by) VALUES (?,?,'contact',?)", [pid, mob, deskId]);
  }
  // Mark the one-time backfill done so a later restart never auto-grants
  // patients created after this policy.
  await logAccess('system', null, 'grants_backfilled', null, null, 'seed: fixture contact grants for synthetic demo patients');

  // The three rows from the client's sample data (verbatim values)
  const o71204 = await addOrder('ORD-71204', lakshmi, drRamanaiah, [['Haemoglobin', 'g/dL', '10.2', '12.0-15.5']]);
  const o71219 = await addOrder('ORD-71219', venkata, drAnitha, [['LDL Cholesterol', 'mg/dL', '142', '0-100']]);
  const o71233 = await addOrder('ORD-71233', farzana, drSuresh, [['Potassium', 'mmol/L', '6.8', '3.5-5.1']]);

  // More synthetic orders across panels and patients
  const o1 = await addOrder('ORD-71201', lakshmi, drRamanaiah, CBC('10.8', '3.9', '7200', '210000', '33', '76', '34'), 6);
  const o2 = await addOrder('ORD-71202', ramesh, drRamanaiah, DIAB('138', '7.2'), 5);
  const o3 = await addOrder('ORD-71205', srinivas, drAnitha, LIPID('242', '158', '38', '265'), 4);
  const o4 = await addOrder('ORD-71207', padma, drAnitha, THY('7.8'), 3);
  const o5 = await addOrder('ORD-71209', anitha, drSuresh, VIT('14', '165'), 3);
  const o6 = await addOrder('ORD-71211', rafi, drRamanaiah, KFT('1.6', '52', '8.9', '141', '4.4'), 2);
  const o7 = await addOrder('ORD-71213', koteswara, drSuresh, LFT('2.4', '68', '92', '160', '6.1', '3.1'), 2);
  const o8 = await addOrder('ORD-71215', sunitha, drAnitha, CBC('12.8', '4.6', '6800', '280000', '40', '88', '12'), 1);
  const o9 = await addOrder('ORD-71217', swamy, drRamanaiah, KFT('2.9', '78', '9.4', '138', '5.6'), 1);
  await addOrder('ORD-71221', joseph, drSuresh, DIAB('96', '5.2'), 0);
  // Left processing for the reviewer to sign off from the console:
  await addOrder('ORD-71225', venkata, drAnitha, [...LIPID('218', '142', '35', '198'), ...DIAB('121', '6.4')], 0);
  await addOrder('ORD-71227', farzana, drSuresh, KFT('1.1', '30', '6.1', '140', '6.4'), 0); // critical K on sign-off

  for (const [id, days] of [[o71204, 6], [o1, 6], [o2, 5], [o3, 4], [o4, 3], [o5, 3], [o6, 2], [o7, 2], [o8, 1], [o9, 1], [o71233, 0]]) {
    await signOffOrder(id, 'Dr. M. Vidyasagar', { type: 'system', id: null });
    if (days > 0) {
      const signedAt = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
      await run('UPDATE orders SET signed_at=? WHERE id=?', [signedAt, id]);
    }
  }
  // Some historical message traffic so the console looks real
  const hist = async (mobile, kind, days, status, orderId) => {
    const t = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    await run(`INSERT INTO outbox (channel, to_mobile, body, kind, order_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      ['whatsapp', mobile, `Report notification (${kind})`, kind, orderId, status, t, t]);
  };
  await hist('9000000001', 'report_ready', 7, 'delivered', o1);
  await hist('9000000004', 'report_ready', 4, 'delivered', o3);
  await hist('9000000006', 'report_ready', 2, 'failed', o6);
  await hist('9000000008', 'report_ready', 1, 'delivered', o8);

  const counts = {
    patients: (await get('SELECT COUNT(*) c FROM patients')).c,
    orders: (await get('SELECT COUNT(*) c FROM orders')).c,
    results: (await get('SELECT COUNT(*) c FROM results')).c,
    summaries: (await get('SELECT COUNT(*) c FROM summaries')).c,
    links: (await get('SELECT COUNT(*) c FROM report_links')).c,
    callbacks: (await get('SELECT COUNT(*) c FROM callback_tasks')).c,
    outbox: (await get('SELECT COUNT(*) c FROM outbox')).c,
  };
  console.log('seeded:', counts);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
