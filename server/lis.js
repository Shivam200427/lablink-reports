import { parse } from 'csv-parse/sync';
import { all, get, run, insert, logAccess, transaction, isPostgres } from './db.js';
import { flagResult } from './flags.js';
import { findKBEntry } from './kb.js';
import { randomToken, sha256, addHours, now } from './crypto.js';
import { queueMessage } from './outbox.js';
import { generateSummariesForOrder } from './summary.js';
import { generateReportPDF } from './pdf.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function norm(h) { return String(h || '').trim().toLowerCase().replace(/[^a-z]/g, ''); }

export async function importCSV(text, actor = { type: 'staff', id: null }) {
  return transaction(() => importCSVTransaction(text, actor));
}
async function importCSVTransaction(text, actor) {
  // Serialize imports across app processes too, so repeats cannot duplicate rows.
  if (isPostgres) await get('SELECT pg_advisory_xact_lock(7120401)');
  const readyOrders = new Set();
  const heldOrders = new Set();
  let rows;
  try { rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, max_record_size: 65536 }); }
  catch { const e = new Error('invalid_csv'); e.status = 400; throw e; }
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
      if (!orderCode || !patientName || !parameter || value == null || String(value).trim() === '') {
        if (orderCode) heldOrders.add(orderCode);
        report.errors.push(`row ${i + 2}: missing order/patient/parameter/result`);
        continue;
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(orderCode)) { heldOrders.add(orderCode); report.errors.push(`row ${i + 2}: invalid order code`); continue; }
      report.ordersTouched.add(orderCode);

      // Identity linkage: an import NEVER grants access and never merges
      // identities. Rows attach to lab-created records only (mobile+name, or
      // name-only with exactly one lab match). A row whose mobile+name matches
      // a SELF-REGISTERED account attaches to a lab-created record and raises
      // a pending merge (patient_merges): the lab's data and the person's
      // account stay separate until staff attest the identity match.
      // Name-only rows must never guess between same-named lab patients:
      // an ambiguous name holds the row with a staff-facing error asking for
      // a Mobile column, instead of silently attaching to the first match.
      let patient;
      if (mobile) {
        patient = (await get("SELECT * FROM patients WHERE created_via='lis' AND merged_into IS NULL AND mobile=? AND lower(trim(full_name))=lower(trim(?)) ORDER BY id LIMIT 1", [mobile, patientName]));
      } else {
        const named = (await all("SELECT * FROM patients WHERE created_via='lis' AND merged_into IS NULL AND lower(trim(full_name))=lower(trim(?))", [patientName]));
        if (named.length > 1) {
          heldOrders.add(orderCode);
          report.errors.push(`row ${i + 2}: ambiguous patient name '${patientName}' (${named.length} lab records share it) - row held; include Mobile in the export to identify the patient`);
          continue;
        }
        patient = named[0];
      }
      if (!patient) {
        const pid = await insert('INSERT INTO patients (full_name, age, sex, mobile) VALUES (?,?,?,?)', [patientName, age, sex, mobile || `unknown-${patientName}`]);
        patient = (await get('SELECT * FROM patients WHERE id=?', [pid]));
        report.newPatients++;
      }
      if (mobile) {
        // Possible identity match with a self-registered account? Record it for
        // staff attestation; nothing is attached to that account by the import.
        const selfP = (await get("SELECT id FROM patients WHERE created_via='self' AND merged_into IS NULL AND mobile=? AND lower(trim(full_name))=lower(trim(?))", [mobile, patientName]));
        if (selfP && selfP.id !== patient.id) {
          const pending = (await get("SELECT 1 AS x FROM patient_merges WHERE lab_patient_id=? AND self_patient_id=? AND status='pending'", [patient.id, selfP.id]));
          if (!pending) {
            await insert('INSERT INTO patient_merges (lab_patient_id, self_patient_id) VALUES (?,?)', [patient.id, selfP.id]);
            await logAccess(actor.type, actor.id, 'merge_pending', 'patient', patient.id, `possible identity match with self-registered account #${selfP.id}`);
            report.pendingMerges = (report.pendingMerges || 0) + 1;
          }
        }
      }
      let doctor = null;
      if (doctorName) {
        doctor = (await get('SELECT * FROM doctors WHERE full_name=?', [doctorName]));
        if (!doctor) {
          const did = await insert('INSERT INTO doctors (full_name) VALUES (?)', [doctorName]);
          doctor = (await get('SELECT * FROM doctors WHERE id=?', [did]));
        }
      }
      let order = (await get('SELECT * FROM orders WHERE order_code=?', [orderCode]));
      if (!order) {
        const st = 'processing'; // All rows must land before a signed export is released.
        const oid = await insert('INSERT INTO orders (order_code, patient_id, doctor_id, status) VALUES (?,?,?,?)', [orderCode, patient.id, doctor?.id ?? null, st]);
        order = (await get('SELECT * FROM orders WHERE id=?', [oid]));
        report.newOrders++;
      }
      if (order.patient_id !== patient.id) { heldOrders.add(orderCode); report.errors.push(`row ${i + 2}: order patient mismatch - row held`); continue; }
      if (/^(ready|signed|critical|ready_critical)$/i.test(status.trim())) readyOrders.add(orderCode);
      // Already signed orders are immutable. Exact repeats are safe; corrections
      // need an explicit amended-report workflow, not a silent second release.
      const existing = await get("SELECT * FROM results WHERE order_id=? AND parameter=? AND value=? AND COALESCE(unit,'')=? AND COALESCE(reference_range,'')=?", [order.id, parameter, String(value), unit || '', range || '']);
      if (existing) continue;
      if (order.signed_at) {
        heldOrders.add(orderCode);
        report.errors.push(`row ${i + 2}: signed order ${orderCode} differs; use an amended-report workflow`);
        continue;
      }
      const kb = findKBEntry(parameter);
      const flag = flagResult(value, range, kb);
      (await run('INSERT INTO results (order_id, parameter, unit, value, reference_range, flag) VALUES (?,?,?,?,?,?)', [order.id, parameter, unit, String(value), range, flag]));
    } catch (e) {
      throw new Error(`row ${i + 2}: ${e.message}`); // Roll back DB failures; retry the complete file safely.
    }
  }
  for (const code of readyOrders) {
    if (heldOrders.has(code)) continue;
    const o = await get('SELECT * FROM orders WHERE order_code=?', [code]);
    if (o.signed_at) continue;
    const signed = await signOffOrder(o.id, 'LIS signed export', actor);
    if (signed.error) throw new Error(`sign-off ${code}: ${signed.error}`);
    report.signedOff++;
  }
  await logAccess(actor.type, actor.id, 'lis_import', 'orders', null, `${report.rows} rows, ${report.newOrders} new orders`);
  return { ...report, ordersTouched: report.ordersTouched.size };
}

// Sign-off: pathologist signs -> status flips, secure 72h link created,
// mocked WhatsApp goes out, summaries generated, critical results raise callbacks.
export async function signOffOrder(orderId, signedBy = 'Duty Pathologist', actor = { type: 'system', id: null }) {
  return transaction(() => signOffTransaction(orderId, signedBy, actor));
}
async function signOffTransaction(orderId, signedBy, actor) {
  const order = (await get('SELECT * FROM orders WHERE id=?' + (isPostgres ? ' FOR UPDATE' : ''), [orderId]));
  if (!order) return { error: 'not_found' };
  if (order.signed_at) return { error: 'already_signed' };
  const results = (await all('SELECT * FROM results WHERE order_id=?', [orderId]));
  const critical = results.filter(r => r.flag === 'critical');
  const status = critical.length ? 'ready_critical' : 'ready';
  (await run('UPDATE orders SET status=?, signed_at=?, signed_by=? WHERE id=?', [status, now(), signedBy, orderId]));

  const token = randomToken();
  (await run('INSERT INTO report_links (token_hash, order_id, expires_at) VALUES (?,?,?)', [sha256(token), orderId, addHours(72)]));
  const patient = (await get('SELECT * FROM patients WHERE id=?', [order.patient_id]));
  const link = `${BASE_URL}/r/${token}`;
  if (!String(patient.mobile).startsWith('unknown-')) {
    await queueMessage({
      channel: 'whatsapp', toMobile: patient.mobile, kind: 'report_ready', orderId,
      body: `Namaste ${patient.full_name} garu, your lab report ${order.order_code} is ready. Open this secure link within 72 hours: ${link} - Company A Diagnostics`,
    });
  }
  for (const r of critical) {
    (await run('INSERT INTO callback_tasks (order_id, result_id, reason) VALUES (?,?,?)', [orderId, r.id, `Critical ${r.parameter}: ${r.value} ${r.unit ?? ''} (range ${r.reference_range ?? '-'})`]));
    await logAccess('system', null, 'callback_created', 'order', orderId, `critical ${r.parameter}`);
  }
  const summaries = await generateSummariesForOrder(orderId);
  // Reload after sign-off so the first PDF has the persisted signer and time.
  const signedOrder = await get('SELECT * FROM orders WHERE id=?', [orderId]);
  const pdfPath = await generateReportPDF(signedOrder, patient, order.doctor_id ? (await get('SELECT * FROM doctors WHERE id=?', [order.doctor_id])) : null, results);
  await logAccess(actor.type, actor.id, 'order_signed', 'order', orderId, `${order.order_code} -> ${status}; ${summaries} summaries`);
  return { ok: true, status, link, summaries, critical: critical.length, pdfPath };
}
