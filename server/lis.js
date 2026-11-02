import { parse } from 'csv-parse/sync';
import { db, logAccess } from './db.js';
import { flagResult } from './flags.js';
import { findKBEntry } from './kb.js';
import { randomToken, sha256, addHours, now } from './crypto.js';
import { queueMessage } from './outbox.js';
import { generateSummariesForOrder } from './summary.js';
import { generateReportPDF } from './pdf.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function norm(h) { return String(h || '').trim().toLowerCase().replace(/[^a-z]/g, ''); }

export function importCSV(text, actor = { type: 'staff', id: null }) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  const report = { rows: rows.length, ordersTouched: new Set(), newOrders: 0, newPatients: 0, signedOff: 0, errors: [] };
  for (const [i, row] of rows.entries()) {
    try {
      const r = {};
      for (const [k, v] of Object.entries(row)) r[norm(k)] = v;
      const orderCode = r.orderid || r.order || r.ordercode;
      const patientName = r.patient || r.patientname || r.name;
      const parameter = r.parameter || r.test;
      const value = r.result ?? r.value;
      const range = r.referencerange || r.range || r.refrange || null;
      const status = r.status || '';
      const doctorName = r.referringdoctor || r.doctor || r.refdoctor || null;
      const mobile = (r.mobile || r.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      const age = r.age ? parseInt(r.age, 10) : null;
      let sex = (r.sex || r.gender || '').trim().toUpperCase();
      if (!['M', 'F', 'O'].includes(sex)) sex = null;
      const unit = r.unit || null;
      if (!orderCode || !patientName || !parameter || value == null) {
        report.errors.push(`row ${i + 2}: missing order/patient/parameter/result`);
        continue;
      }
      report.ordersTouched.add(orderCode);

      let patient = mobile
        ? db.prepare('SELECT * FROM patients WHERE mobile=? AND full_name=?').get(mobile, patientName)
        : db.prepare('SELECT * FROM patients WHERE full_name=?').get(patientName);
      if (!patient) {
        const info = db.prepare('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)')
          .run(patientName, age, sex, mobile || `unknown-${patientName}`);
        patient = db.prepare('SELECT * FROM patients WHERE id=?').get(info.lastInsertRowid);
        report.newPatients++;
      }
      let doctor = null;
      if (doctorName) {
        doctor = db.prepare('SELECT * FROM doctors WHERE full_name=?').get(doctorName);
        if (!doctor) {
          const info = db.prepare('INSERT INTO doctors (full_name) VALUES (?)').run(doctorName);
          doctor = db.prepare('SELECT * FROM doctors WHERE id=?').get(info.lastInsertRowid);
        }
      }
      let order = db.prepare('SELECT * FROM orders WHERE order_code=?').get(orderCode);
      if (!order) {
        const st = /critical/i.test(status) ? 'ready_critical' : /ready|signed/i.test(status) ? 'ready' : 'processing';
        const info = db.prepare('INSERT INTO orders (order_code, patient_id, doctor_id, status) VALUES (?,?,?,?)')
          .run(orderCode, patient.id, doctor?.id ?? null, st);
        order = db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid);
        report.newOrders++;
      }
      const kb = findKBEntry(parameter);
      const flag = flagResult(value, range, kb);
      db.prepare('INSERT INTO results (order_id, parameter, unit, value, reference_range, flag) VALUES (?,?,?,?,?,?)')
        .run(order.id, parameter, unit, String(value), range, flag);
    } catch (e) {
      report.errors.push(`row ${i + 2}: ${e.message}`);
    }
  }
  logAccess(actor.type, actor.id, 'lis_import', 'orders', null, `${report.rows} rows, ${report.newOrders} new orders`);
  return { ...report, ordersTouched: report.ordersTouched.size };
}

// Sign-off: pathologist signs -> status flips, secure 72h link created,
// mocked WhatsApp goes out, summaries generated, critical results raise callbacks.
export async function signOffOrder(orderId, signedBy = 'Duty Pathologist', actor = { type: 'system', id: null }) {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!order) return { error: 'not_found' };
  if (order.status !== 'processing') return { error: 'already_signed' };
  const results = db.prepare('SELECT * FROM results WHERE order_id=?').all(orderId);
  const critical = results.filter(r => r.flag === 'critical');
  const status = critical.length ? 'ready_critical' : 'ready';
  db.prepare('UPDATE orders SET status=?, signed_at=?, signed_by=? WHERE id=?').run(status, now(), signedBy, orderId);

  const token = randomToken();
  db.prepare('INSERT INTO report_links (token_hash, order_id, expires_at) VALUES (?,?,?)')
    .run(sha256(token), orderId, addHours(72));
  const patient = db.prepare('SELECT * FROM patients WHERE id=?').get(order.patient_id);
  const link = `${BASE_URL}/r/${token}`;
  if (!String(patient.mobile).startsWith('unknown-')) {
    queueMessage({
      channel: 'whatsapp', toMobile: patient.mobile, kind: 'report_ready', orderId,
      body: `Namaste ${patient.full_name} garu, your lab report ${order.order_code} is ready. Open this secure link within 72 hours: ${link} - Company A Diagnostics`,
    });
  }
  for (const r of critical) {
    db.prepare('INSERT INTO callback_tasks (order_id, result_id, reason) VALUES (?,?,?)')
      .run(orderId, r.id, `Critical ${r.parameter}: ${r.value} ${r.unit ?? ''} (range ${r.reference_range ?? '-'})`);
    logAccess('system', null, 'callback_created', 'order', orderId, `critical ${r.parameter}`);
  }
  const summaries = await generateSummariesForOrder(orderId);
  const pdfPath = await generateReportPDF(order, patient, order.doctor_id ? db.prepare('SELECT * FROM doctors WHERE id=?').get(order.doctor_id) : null, results);
  logAccess(actor.type, actor.id, 'order_signed', 'order', orderId, `${order.order_code} -> ${status}; ${summaries} summaries`);
  return { ok: true, status, link, summaries, critical: critical.length, pdfPath };
}
