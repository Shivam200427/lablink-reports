import { beforeAll, describe, expect, it, beforeEach } from 'vitest';

process.env.DATA_DIR = '/tmp/lablink-sms-test-' + Date.now();

let db, requestOTP, sendRealSms, _setFetchForTests, queueMessage, tickOutbox;

beforeAll(async () => {
  const dbmod = await import('../server/db.js');
  await dbmod.initDB();
  db = dbmod.db;
  ({ requestOTP } = await import('../server/otp.js'));
  ({ sendRealSms, _setFetchForTests } = await import('../server/sms.js'));
  ({ queueMessage, tickOutbox } = await import('../server/outbox.js'));
});

const outboxRows = (mobile) => db.prepare('SELECT * FROM outbox WHERE to_mobile=? ORDER BY id').all(mobile);
const ALLOWED = '8260973845';

beforeEach(() => {
  db.prepare('DELETE FROM outbox').run();
  db.prepare('DELETE FROM otps').run();
  db.prepare('DELETE FROM access_log').run();
  db.prepare('DELETE FROM sms_real_claims').run();
  delete process.env.FAST2SMS_API_KEY;
  delete process.env.FAST2SMS_ALLOWED_RECIPIENT;
  delete process.env.FAST2SMS_TOTAL_BUDGET;
  _setFetchForTests(() => { throw new Error('fetch must not be called'); });
});

describe('SMS provider adapter', () => {
  it('mocked path is unchanged when no API key is set', async () => {
    await requestOTP(ALLOWED, 'login');
    const rows = outboxRows(ALLOWED);
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBeNull();
    expect(rows[0].status).toBe('queued');
    await tickOutbox();
    expect(outboxRows(ALLOWED)[0].status).toBe('sent');
  });

  it('sends via provider only for the allowed recipient and marks it sent (never delivered)', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_ALLOWED_RECIPIENT = '+91 ' + ALLOWED;
    process.env.FAST2SMS_TOTAL_BUDGET = '3';
    const calls = [];
    _setFetchForTests(async (url) => { calls.push(url); return { status: 200, json: async () => ({ return: true, request_id: 'rid-1' }) }; });
    await requestOTP(ALLOWED, 'login');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('route=q');
    expect(calls[0]).toContain(`numbers=${ALLOWED}`);
    expect(calls[0]).toContain('authorization=test-key');
    const rows = outboxRows(ALLOWED);
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('fast2sms');
    expect(rows[0].status).toBe('sent');
    await tickOutbox();
    expect(outboxRows(ALLOWED)[0].status).toBe('sent'); // no fake delivery
  });

  it('never calls the provider for other recipients - falls back to the mocked outbox', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_ALLOWED_RECIPIENT = ALLOWED;
    await requestOTP('9000000001', 'login');
    const rows = outboxRows('9000000001');
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBeNull();
  });

  it('provider failure records failed and leaves a mocked fallback copy', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_ALLOWED_RECIPIENT = ALLOWED;
    process.env.FAST2SMS_TOTAL_BUDGET = '3';
    _setFetchForTests(async () => ({ status: 200, json: async () => ({ return: false, message: 'Insufficient balance' }) }));
    await requestOTP(ALLOWED, 'login');
    const rows = outboxRows(ALLOWED);
    expect(rows).toHaveLength(2);
    const failed = rows.find(r => r.provider === 'fast2sms');
    const fallback = rows.find(r => r.provider === null);
    expect(failed.status).toBe('failed');
    expect(failed.provider_status).toContain('Insufficient balance');
    expect(fallback).toBeTruthy();
  });

  it('enforces a durable TOTAL budget: one approval means exactly one attempt, even after failure', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_ALLOWED_RECIPIENT = ALLOWED;
    process.env.FAST2SMS_TOTAL_BUDGET = '1';
    let calls = 0;
    _setFetchForTests(async () => { calls++; return { status: 200, json: async () => ({ return: false, message: 'provider down' }) }; });
    const first = await sendRealSms({ toMobile: ALLOWED, body: 'one' });
    const second = await sendRealSms({ toMobile: ALLOWED, body: 'two' });
    expect(first.attempted).toBe(true);
    expect(first.ok).toBe(false);
    expect(second.attempted).toBe(false);
    expect(second.reason).toBe('budget_exhausted');
    expect(calls).toBe(1); // the failed attempt is consumed, no retry possible
  });

  it('default budget is zero: a configured key alone cannot send', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_ALLOWED_RECIPIENT = ALLOWED;
    const r = await sendRealSms({ toMobile: ALLOWED, body: 'x' });
    expect(r.attempted).toBe(false);
    expect(r.reason).toBe('budget_exhausted');
  });

  it('blocks real sends when no allowed recipient is configured', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    const r = await sendRealSms({ toMobile: ALLOWED, body: 'x' });
    expect(r.attempted).toBe(false);
    expect(r.reason).toBe('recipient_not_allowed');
  });
});
