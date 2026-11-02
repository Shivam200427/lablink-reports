import fs from 'node:fs';
import path from 'node:path';
import { importCSV } from './lis.js';
import { logAccess } from './db.js';

const DATA_DIR = process.env.DATA_DIR || './data';

// LIS export-folder watch: the lab's LIS drops export CSVs into a watched
// folder; each new file is imported through the SAME pipeline as the console
// upload (server/lis.js importCSV), then moved to imported/ or failed/ so
// nothing is imported twice. The actor is honestly 'system' in the access
// log - no staff member is credited. Imports still never grant access and
// never merge identities (see importCSV).
export function startLisWatch(dir = process.env.LIS_WATCH_DIR || path.join(DATA_DIR, 'lis-incoming'), intervalMs = Number(process.env.LIS_WATCH_INTERVAL_MS) || 5000) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'imported'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'failed'), { recursive: true });
  let busy = false;
  async function sweep() {
    if (busy) return;
    busy = true;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.toLowerCase().endsWith('.csv')) continue;
        const full = path.join(dir, f);
        let text;
        try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
        try {
          const report = await importCSV(text, { type: 'system', id: null });
          fs.renameSync(full, path.join(dir, 'imported', `${Date.now()}-${f}`));
          await logAccess('system', null, 'lis_watch_import', 'orders', null, `${f}: ${report.rows} rows, ${report.newOrders} new orders, ${report.errors.length} row errors`);
          if (report.errors.length) {
            await logAccess('system', null, 'lis_watch_row_errors', 'orders', null, `${f}: ${report.errors.slice(0, 5).join(' | ')}`);
          }
        } catch (e) {
          try { fs.renameSync(full, path.join(dir, 'failed', `${Date.now()}-${f}`)); } catch {}
          await logAccess('system', null, 'lis_watch_failed', 'orders', null, `${f}: ${e.message}`);
        }
      }
    } finally { busy = false; }
  }
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  console.log(`LIS watch: ${dir} every ${intervalMs}ms`);
  return { dir, sweep, stop: () => clearInterval(timer) };
}
