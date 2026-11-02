import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const TEAL = '#0f766e', INK = '#0f172a', BODY = '#334155', MUTED = '#64748b';
const LINE = '#e2e8f0', ZEBRA = '#f8fafc', BAD = '#b91c1c', GOOD = '#15803d';

// columns (x, width) inside a 50..545 content box
const COLS = [
  { key: 'parameter', x: 56,  w: 200, label: 'Parameter' },
  { key: 'value',     x: 262, w: 96,  label: 'Result' },
  { key: 'range',     x: 364, w: 120, label: 'Reference range' },
  { key: 'flag',      x: 490, w: 52,  label: 'Flag' },
];
const ROW_PAD = 7;

export function generateReportPDF(order, patient, doctor, results) {
  const dir = path.join(DATA_DIR, 'pdfs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${order.order_code}.pdf`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);

    // ---- header band ----
    doc.font('Helvetica-Bold').fontSize(17).fillColor(TEAL).text('Company A Diagnostics', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(BODY).text('Vijayawada, Andhra Pradesh', { align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor(TEAL).stroke();
    doc.moveDown(0.7);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(`Lab Report  ${order.order_code}`);
    doc.moveDown(0.5);

    // ---- patient info grid: label/value pairs in two columns ----
    const info = [
      ['Patient', patient.full_name, 'Age / Sex', `${patient.age ?? '-'} / ${patient.sex ?? '-'}`],
      ['Referring doctor', doctor?.full_name ?? '-', 'Reported', order.signed_at ?? '-'],
    ];
    doc.fontSize(9);
    for (const [l1, v1, l2, v2] of info) {
      const y = doc.y;
      doc.font('Helvetica').fillColor(MUTED).text(l1, 50, y, { width: 110 });
      doc.font('Helvetica-Bold').fillColor(INK).text(v1, 165, y, { width: 180 });
      doc.font('Helvetica').fillColor(MUTED).text(l2, 360, y, { width: 70 });
      doc.font('Helvetica-Bold').fillColor(INK).text(v2, 435, y, { width: 110 });
      doc.y = y + Math.max(
        doc.heightOfString(v1, { width: 180 }),
        doc.heightOfString(v2, { width: 110 })) + 6;
    }
    doc.moveDown(0.8);

    // ---- results table ----
    const tableTop = () => {
      const y = doc.y;
      doc.rect(50, y, 495, 22).fill('#f1f5f9');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BODY);
      for (const c of COLS) doc.text(c.label, c.x, y + 7, { width: c.w });
      doc.y = y + 22;
    };
    const rowText = (r, key) => {
      if (key === 'value') return `${r.value}${r.unit ? ' ' + r.unit : ''}`;
      if (key === 'range') return r.reference_range ?? '-';
      if (key === 'flag') return r.flag === 'normal' ? '' : String(r.flag).toUpperCase();
      return String(r[key] ?? '-');
    };
    tableTop();
    let i = 0;
    for (const r of results) {
      doc.font('Helvetica').fontSize(9.5);
      const h = Math.max(...COLS.map((c) =>
        doc.heightOfString(rowText(r, c.key), { width: c.w }))) + ROW_PAD * 2;
      if (doc.y + h > 720) {
        doc.addPage();
        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
          .text(`${patient.full_name} - ${order.order_code} (continued)`, 50, doc.y, { width: 495 });
        doc.moveDown(0.4);
        tableTop();
      }
      const y = doc.y;
      if (i % 2 === 1) doc.rect(50, y, 495, h).fill(ZEBRA);
      for (const c of COLS) {
        const txt = rowText(r, c.key);
        if (c.key === 'flag') {
          doc.font('Helvetica-Bold').fillColor(r.flag === 'normal' ? GOOD : BAD).text(txt || '-', c.x, y + ROW_PAD, { width: c.w });
        } else if (c.key === 'value') {
          doc.font('Helvetica-Bold').fillColor(INK).text(txt, c.x, y + ROW_PAD, { width: c.w });
        } else if (c.key === 'range') {
          doc.font('Helvetica').fillColor(MUTED).text(txt, c.x, y + ROW_PAD, { width: c.w });
        } else {
          doc.font('Helvetica').fillColor(INK).text(txt, c.x, y + ROW_PAD, { width: c.w });
        }
      }
      doc.moveTo(50, y + h).lineTo(545, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.y = y + h;
      i++;
    }
    doc.moveDown(2.5);

    // ---- signature + footer ----
    if (doc.y > 700) doc.addPage();
    doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      .text(`Signed by: ${order.signed_by ?? 'Duty Pathologist'}, Pathologist`, 50, doc.y, { width: 495 });

    // footer on every page
    const pages = doc.bufferedPageRange();
    for (let p = 0; p < pages.count; p++) {
      doc.switchToPage(pages.start + p);
      doc.moveTo(50, 762).lineTo(545, 762).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8').text(
        'SAMPLE DATA - synthetic demo report generated for the LabLink prototype. Not a medical document.',
        50, 768, { width: 495, align: 'center' });
      if (pages.count > 1) {
        doc.text(`Page ${p + 1} of ${pages.count}`, 50, 780, { width: 495, align: 'center' });
      }
    }
    doc.end();
    stream.on('finish', () => resolve(file));
    stream.on('error', reject);
  });
}
