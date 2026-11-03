import { beforeAll, describe, expect, it, vi } from 'vitest';
process.env.DATA_DIR='/tmp/lablink-ready-import-'+Date.now();
process.env.AI_OFF='1';
const {pdfSpy}=vi.hoisted(()=>({pdfSpy:vi.fn(async()=>'/tmp/import-test.pdf')}));
vi.mock('../server/pdf.js',()=>({generateReportPDF:pdfSpy}));
let db,importCSV;
const h='OrderID,Patient,Mobile,Parameter,Result,Unit,ReferenceRange,Status\n';
const row=(o,p,v,s='Ready')=>`${o},Import Test,9000000096,${p},${v},mmol/L,3.5-5.1,${s}\n`;
beforeAll(async()=>{const m=await import('../server/db.js');await m.initDB();db=m.db;({importCSV}=await import('../server/lis.js'));});
const counts=()=>Object.fromEntries(['orders','results','report_links','outbox','callback_tasks','summaries'].map(t=>[t,db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));
describe('signed LIS export pipeline',()=>{
 it('loads mixed rows before signoff, flags critical, creates one callback/link/message and no critical summary',async()=>{
  const r=await importCSV(h+row('ORD-IMP1','Potassium','6.8')+row('ORD-IMP1','Sodium','140','Processing')+row('ORD-IMP2','Potassium','4.0','Processing'));
  expect(r.signedOff).toBe(1);expect(r.errors).toEqual([]);
  const o=db.prepare("SELECT * FROM orders WHERE order_code='ORD-IMP1'").get();expect(o.status).toBe('ready_critical');expect(o.signed_at).toBeTruthy();
  expect(db.prepare('SELECT COUNT(*) n FROM results WHERE order_id=?').get(o.id).n).toBe(2);
  expect(db.prepare('SELECT COUNT(*) n FROM callback_tasks WHERE order_id=?').get(o.id).n).toBe(1);
  expect(db.prepare('SELECT COUNT(*) n FROM report_links WHERE order_id=?').get(o.id).n).toBe(1);
  expect(db.prepare("SELECT COUNT(*) n FROM summaries s JOIN results r ON s.result_id=r.id WHERE r.order_id=? AND r.flag='critical'").get(o.id).n).toBe(0);
  expect(pdfSpy.mock.calls.at(-1)[3]).toHaveLength(2);
  const proc=db.prepare("SELECT * FROM orders WHERE order_code='ORD-IMP2'").get();expect(proc.signed_at).toBeNull();expect(db.prepare('SELECT COUNT(*) n FROM report_links WHERE order_id=?').get(proc.id).n).toBe(0);
 });
 it('exact repeat creates no results, links, messages or callbacks',async()=>{
  const before=counts();const r=await importCSV(h+row('ORD-IMP1','Potassium','6.8')+row('ORD-IMP1','Sodium','140','Processing'));
  expect(r.signedOff).toBe(0);expect(counts()).toEqual(before);
 });
 it('holds changed signed results instead of silently replacing them',async()=>{
  const before=counts();const r=await importCSV(h+row('ORD-IMP1','Potassium','7.0'));expect(r.errors.join()).toContain('amended-report');expect(counts()).toEqual(before);
 });
 it('rolls back a failed release and safely retries without duplicates',async()=>{
  const before=counts();pdfSpy.mockRejectedValueOnce(new Error('disk full'));
  await expect(importCSV(h+row('ORD-IMP3','Potassium','6.9'))).rejects.toThrow('disk full');expect(counts()).toEqual(before);
  const retry=await importCSV(h+row('ORD-IMP3','Potassium','6.9'));expect(retry.signedOff).toBe(1);
  expect(db.prepare("SELECT COUNT(*) n FROM orders WHERE order_code='ORD-IMP3'").get().n).toBe(1);
 });
 it('holds a partially invalid order instead of prematurely releasing its valid rows',async()=>{
  const r=await importCSV(h+row('ORD-IMP4','Potassium','4.1')+'ORD-IMP4,Import Test,9000000096,,4.2,mmol/L,3.5-5.1,Ready\n');
  expect(r.signedOff).toBe(0);expect(r.errors.length).toBe(1);const o=db.prepare("SELECT * FROM orders WHERE order_code='ORD-IMP4'").get();expect(o.signed_at).toBeNull();
 });
});
