import { get, logAccess, run, insert } from './db.js';
import { now } from './crypto.js';

// Mocked WhatsApp/SMS: messages are written to the outbox table only.
// A ticker simulates the provider: queued -> sent -> delivered.
export async function queueMessage({ channel, toMobile, body, kind, orderId, provider = null, providerStatus = null, status = 'queued' }) {
  const id = await insert(
    'INSERT INTO outbox (channel, to_mobile, body, kind, order_id, status, provider, provider_status) VALUES (?,?,?,?,?,?,?,?)'
  , [channel, toMobile, body, kind, orderId ?? null, status, provider, providerStatus]);
  await logAccess('system', null, 'message_queued', 'outbox', id, `${channel} -> ${toMobile} (${kind})`);
  return id;
}

export async function tickOutbox() {
  (await run(`UPDATE outbox SET status='sent', updated_at=? WHERE status='queued' AND provider IS NULL`, [now()]));
  (await run(`UPDATE outbox SET status='delivered', updated_at=? WHERE status='sent' AND provider IS NULL AND updated_at <= datetime('now','-20 seconds')`, [now()]));
}

export async function resendMessage(outboxId, actor) {
  const m = (await get('SELECT * FROM outbox WHERE id = ?', [outboxId]));
  if (!m) return null;
  (await run(`UPDATE outbox SET status='queued', updated_at=? WHERE id=?`, [now(), outboxId]));
  await logAccess(actor.type, actor.id, 'message_resent', 'outbox', outboxId, `${m.channel} -> ${m.to_mobile} (${m.kind})`);
  return (await get('SELECT * FROM outbox WHERE id = ?', [outboxId]));
}
