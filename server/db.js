// Database layer - dual engine.
//   Local dev + tests: SQLite via better-sqlite3 (zero setup).
//   Deployed demo:     Render Postgres when DATABASE_URL is set (survives
//                      restarts/redeploys; free tier expires 30 days after
//                      creation - this instance expires 2026-12-02).
// All access is async so both engines share one call shape:
//   await all(sql, params) / get(sql, params) / run(sql, params) / insert(sql, params)
// SQL is written SQLite-style; pgify() rewrites the few dialect differences
// (datetime('now') variants and ? placeholders) for Postgres.
import fs from 'node:fs';
import path from 'node:path';

export const isPostgres = !!process.env.DATABASE_URL;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const PG_NOW = "to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')";

let sdb = null;  // better-sqlite3 handle (sqlite mode)
let pool = null; // pg Pool (postgres mode)
export let db = null; // raw sqlite handle - tests and sqlite-mode diagnostics only

export function pgify(sql) {
  sql = sql.replace(/datetime\('now'\s*,\s*'([+-])(\d+)\s*(seconds?|minutes?|hours?|days?)'\)/g,
    (m, sign, n, unit) => `to_char((now() AT TIME ZONE 'utc') ${sign} interval '${n} ${unit}','YYYY-MM-DD HH24:MI:SS')`);
  sql = sql.replace(/datetime\('now'\)/g, PG_NOW);
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const DDL = `
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  age INTEGER,
  sex TEXT CHECK (sex IN ('M','F','O')),
  mobile TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','te','hi')),
  consent_given_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('frontdesk','ops','pathologist')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  mobile TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','ready_critical')),
  ordered_at TEXT NOT NULL DEFAULT (datetime('now')),
  signed_at TEXT,
  signed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders(patient_id);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  parameter TEXT NOT NULL,
  unit TEXT,
  value TEXT NOT NULL,
  reference_range TEXT,
  flag TEXT NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal','low','high','critical','unknown'))
);
CREATE INDEX IF NOT EXISTS idx_results_order ON results(order_id);

CREATE TABLE IF NOT EXISTS report_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_links_order ON report_links(order_id);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otps_mobile ON otps(mobile);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('patient','staff','doctor','link')),
  actor_id INTEGER NOT NULL,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms')),
  to_mobile TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_access_entity ON access_log(entity, entity_id);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL UNIQUE REFERENCES results(id),
  lang_en TEXT, lang_te TEXT, lang_hi TEXT,
  engine TEXT NOT NULL DEFAULT 'template',
  confidence TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high','low')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS summary_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id INTEGER NOT NULL REFERENCES summaries(id),
  staff_id INTEGER REFERENCES staff(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('ok','needs_fix')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(summary_id, staff_id)
);

CREATE TABLE IF NOT EXISTS summary_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id INTEGER NOT NULL REFERENCES summaries(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES staff(id)
);

CREATE TABLE IF NOT EXISTS callback_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  result_id INTEGER NOT NULL REFERENCES results(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT,
  done_by INTEGER REFERENCES staff(id)
);
`;

const DDL_PG = DDL
  .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
  .replace(/DEFAULT \(datetime\('now'\)\)/g, `DEFAULT (${PG_NOW})`);

export async function initDB() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'pdfs'), { recursive: true });
  if (isPostgres) {
    const { default: pg } = await import('pg');
    // Render Postgres requires SSL on its EXTERNAL hostname; the internal
    // service-to-service hostname is plaintext on Render's private network.
    const ssl = /\.render\.com/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined;
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl });
    await pool.query(DDL_PG);
  } else {
    const { default: Database } = await import('better-sqlite3');
    sdb = new Database(path.join(DATA_DIR, 'lablink.db'));
    sdb.pragma('journal_mode = WAL');
    sdb.pragma('foreign_keys = ON');
    sdb.exec(DDL);
    db = sdb;
  }
}

export async function all(sql, params = []) {
  if (isPostgres) return (await pool.query(pgify(sql), params)).rows;
  return sdb.prepare(sql).all(params);
}

export async function get(sql, params = []) {
  if (isPostgres) return (await pool.query(pgify(sql), params)).rows[0];
  return sdb.prepare(sql).get(params);
}

export async function run(sql, params = []) {
  if (isPostgres) { const r = await pool.query(pgify(sql), params); return { changes: r.rowCount }; }
  return sdb.prepare(sql).run(params);
}

// INSERT and return the new row id (Postgres: appends RETURNING id).
export async function insert(sql, params = []) {
  if (isPostgres) return Number((await pool.query(pgify(sql) + ' RETURNING id', params)).rows[0].id);
  return Number(sdb.prepare(sql).run(params).lastInsertRowid);
}

export async function logAccess(actorType, actorId, action, entity, entityId, detail) {
  await run(
    'INSERT INTO access_log (actor_type, actor_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)',
    [actorType, actorId ?? null, action, entity ?? null, entityId ?? null, detail ?? null]);
}
