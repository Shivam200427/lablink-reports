import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = '/tmp/lablink-test-watch-' + Date.now();
process.env.BASE_URL = 'http://localhost:3000';

let dbmod, startLisWatch, watchDir;

beforeAll(async () => {
  dbmod = await import('../server/db.js');
  await dbmod.initDB();
  ({ startLisWatch } = await import('../server/liswatch.js'));
  watchDir = path.join(process.env.DATA_DIR, 'lis-incoming-test');
});

describe('LIS export-folder watch', () => {
  it('imports a dropped CSV through the same pipeline and moves it aside', async () => {
    const w = startLisWatch(watchDir, 100000); // manual sweep; timer irrelevant
    fs.writeFileSync(path.join(watchDir, 'export-1.csv'),
      'OrderID,Patient,Age,Sex,Mobile,Parameter,Result,Unit,ReferenceRange,Status,ReferringDoctor\n' +
      'ORD-W001,Watch Patient,45,F,9800000050,Haemoglobin,11.1,g/dL,12.0-15.5,Ready,Dr. Watch\n');
    await w.sweep();
    const order = dbmod.db.prepare("SELECT * FROM orders WHERE order_code='ORD-W001'").get();
    expect(order).toBeTruthy();
    const patient = dbmod.db.prepare('SELECT * FROM patients WHERE id=?').get(order.patient_id);
    expect(patient.full_name).toBe('Watch Patient');
    expect(patient.created_via).toBe('lis');
    // same identity rules as console import: no access grant from a folder drop
    const grants = dbmod.db.prepare('SELECT * FROM patient_access WHERE patient_id=?').all(order.patient_id);
    expect(grants.length).toBe(0);
    // file moved to imported/, never imported twice
    expect(fs.existsSync(path.join(watchDir, 'export-1.csv'))).toBe(false);
    expect(fs.readdirSync(path.join(watchDir, 'imported')).some(f => f.endsWith('export-1.csv'))).toBe(true);
    await w.sweep();
    const count = dbmod.db.prepare("SELECT count(*) AS n FROM orders WHERE order_code='ORD-W001'").get().n;
    expect(count).toBe(1);
    // honest system attribution in the access log
    const log = dbmod.db.prepare("SELECT * FROM access_log WHERE action='lis_watch_import' ORDER BY id DESC LIMIT 1").get();
    expect(log.actor_type).toBe('system');
    expect(log.detail).toContain('export-1.csv');
    w.stop();
  });

  it('a malformed CSV is moved to failed/ and logged, not silently dropped', async () => {
    const w = startLisWatch(watchDir, 100000);
    fs.writeFileSync(path.join(watchDir, 'bad.csv'), 'this is not a csv with required columns\n');
    await w.sweep();
    expect(fs.readdirSync(path.join(watchDir, 'failed')).some(f => f.endsWith('bad.csv')) ||
           fs.readdirSync(path.join(watchDir, 'imported')).some(f => f.endsWith('bad.csv'))).toBe(true);
    const log = dbmod.db.prepare("SELECT * FROM access_log WHERE action LIKE 'lis_watch%' AND detail LIKE '%bad.csv%' ORDER BY id DESC LIMIT 1").get();
    expect(log).toBeTruthy();
    w.stop();
  });
});
