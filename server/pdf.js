import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export function generateReportPDF(order, patient, doctor, results) {
  const dir = path.join(DATA_DIR, 'pdfs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${order.order_code}.pdf`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);
    doc.fontSize(18).fillColor('#0f766e').text('Company A Diagnostics', { align: 'center' });
    doc.fontSize(10).fillColor('#334155').text('Vijayawada, Andhra Pradesh', { align: 'center' });
    doc.moveDown();
    doc.fontSize(13).fillColor('#0f172a').text(`Lab Report - ${order.order_code}`);
    doc.fontSize(10).fillColor('#334155')
      .text(`Patient: ${patient.full_name}    Age/Sex: ${patient.age ?? '-'} / ${patient.sex ?? '-'}`)
      .text(`Referring doctor: ${doctor?.full_name ?? '-'}`)
      .text(`Reported: ${order.signed_at ?? '-'}`);
    doc.moveDown();
    const y0 = doc.y;
    doc.fontSize(10).fillColor('#0f172a');
    doc.text('Parameter', 50, y0, { continued: false });
    doc.text('Result', 260, y0); doc.text('Reference range', 340, y0); doc.text('Flag', 470, y0);
    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#cbd5e1').stroke();
    doc.moveDown(0.5);
    for (const r of results) {
      const y = doc.y;
      const flagText = r.flag === 'normal' ? '' : r.flag.toUpperCase();
      doc.fillColor('#0f172a').text(r.parameter, 50, y, { width: 200 });
      doc.text(`${r.value} ${r.unit ?? ''}`, 260, y, { width: 80 });
      doc.text(r.reference_range ?? '-', 340, y, { width: 120 });
      doc.fillColor(r.flag === 'normal' ? '#64748b' : '#b91c1c').text(flagText, 470, y, { width: 75 });
      if (doc.y > 760) doc.addPage();
    }
    doc.moveDown(2);
    doc.fillColor('#334155').fontSize(10).text(`Signed by: ${order.signed_by ?? 'Duty Pathologist'} (Pathologist)`);
    doc.fontSize(8).fillColor('#94a3b8').text('SAMPLE DATA - synthetic demo report generated for the LabLink prototype. Not a medical document.', { align: 'center' });
    doc.end();
    stream.on('finish', () => resolve(file));
    stream.on('error', reject);
  });
}
