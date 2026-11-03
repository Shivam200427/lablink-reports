import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = '/tmp/lablink-pdf-signoff-' + Date.now();
process.env.AI_OFF = '1';
const { pdfSpy } = vi.hoisted(() => ({ pdfSpy: vi.fn(async () => '/tmp/test-report.pdf') }));
vi.mock('../server/pdf.js', () => ({ generateReportPDF: pdfSpy }));
let db, signOffOrder;
beforeAll(async () => {
  const mod = await import('../server/db.js');
  await mod.initDB(); db = mod.db;
  ({ signOffOrder } = await import('../server/lis.js'));
});
describe('first signed PDF metadata', () => {
  it('uses persisted sign-off time and signer rather than the pre-signoff order', async () => {
    const pid = db.prepare('INSERT INTO patients (full_name,mobile) VALUES (?,?)').run('PDF Test Patient','9000000097').lastInsertRowid;
    const oid = db.prepare('INSERT INTO orders (order_code,patient_id,status) VALUES (?,?,?)').run('ORD-PDF-SIGN',pid,'processing').lastInsertRowid;
    db.prepare('INSERT INTO results (order_id,parameter,value,flag) VALUES (?,?,?,?)').run(oid,'Haemoglobin','14','normal');
    const r = await signOffOrder(Number(oid), 'Dr. PDF Test');
    expect(r.ok).toBe(true);
    const passed = pdfSpy.mock.calls.at(-1)[0];
    const stored = db.prepare('SELECT * FROM orders WHERE id=?').get(oid);
    expect(passed.signed_by).toBe('Dr. PDF Test');
    expect(passed.signed_at).toBeTruthy();
    expect(passed.signed_at).toBe(stored.signed_at);
    expect(passed.status).toBe('ready');
  });
});
