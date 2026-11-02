import { db, logAccess } from './db.js';
import { now } from './crypto.js';

// Mocked WhatsApp/SMS: messages are written to the outbox table only.
// A ticker simulates the provider: queued -> sent -> delivered.
export function queueMessage({ channel, toMobile, body, kind, orderId }) {
  const info = db.prepare(
    'INSERT INTO outbox (channel, to_mobile, body, kind, order_id) VALUES (?,?,?,?,?)'
  ).run(channel, toMobile, body, kind, orderId ?? null);
  logAccess('system', null, 'message_queued', 'outbox', info.lastInsertRowid, `${channel} -> ${toMobile} (${kind})`);
  return info.lastInsertRowid;
}

export function tickOutbox() {
  db.prepare(`UPDATE outbox SET status='sent', updated_at=? WHERE status='queued'`).run(now());
  db.prepare(`UPDATE outbox SET status='delivered', updated_at=? WHERE status='sent' AND updated_at <= datetime('now','-20 seconds')`).run(now());
}

export function resendMessage(outboxId, actor) {
  const m = db.prepare('SELECT * FROM outbox WHERE id = ?').get(outboxId);
  if (!m) return null;
  db.prepare(`UPDATE outbox SET status='queued', updated_at=? WHERE id=?`).run(now(), outboxId);
  logAccess(actor.type, actor.id, 'message_resent', 'outbox', outboxId, `${m.channel} -> ${m.to_mobile} (${m.kind})`);
  return db.prepare('SELECT * FROM outbox WHERE id = ?').get(outboxId);
}
