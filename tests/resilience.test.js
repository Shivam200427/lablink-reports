import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import http from 'node:http';

// Resilience proofs for the provider-failure fixes:
//  1. a hanging AI client cannot stall summary generation (order AI budget)
//  2. the default provider client aborts on a hard timeout
//  3. seed is restart-safe: a second run leaves populated data untouched

process.env.DATA_DIR = '/tmp/lablink-resilience-' + Date.now();
process.env.BASE_URL = 'http://localhost:3000';

let buildSummaryTextsWithAI, setAIClient, generateAISummary;

beforeAll(async () => {
  ({ buildSummaryTextsWithAI } = await import('../server/summary.js'));
  ({ setAIClient, generateAISummary } = await import('../server/ai.js'));
});

describe('AI failure resilience', () => {
  it('falls back to the locked template when the provider hangs past the budget', async () => {
    process.env.AI_ORDER_BUDGET_MS = '200';
    process.env.AI_TIMEOUT_MS = '200';
    setAIClient(() => new Promise(() => {})); // never resolves: provider hang
    const start = Date.now();
    const t = await buildSummaryTextsWithAI({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', reference_range: '0-100', flag: 'high' });
    // The hanging call itself is not awaited past the hard ceiling below;
    // what must hold: result is the honest template, never a hang or error.
    expect(t.engine).toBe('template');
    expect(t.lang_en).toContain('above the normal range');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    setAIClient(null);
    delete process.env.AI_ORDER_BUDGET_MS;
    delete process.env.AI_TIMEOUT_MS;
  }, 30000);

  it('default provider fetch aborts on the hard timeout against a silent server', async () => {
    const server = http.createServer(() => {}); // accepts, never replies
    await new Promise((r) => server.listen(0, r));
    process.env.AI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
    process.env.AI_TIMEOUT_MS = '400';
    const start = Date.now();
    let threw = false;
    try {
      await generateAISummary({ parameter: 'LDL Cholesterol', value: '142', unit: 'mg/dL', referenceRange: '0-100', flag: 'high', lang: 'en' });
    } catch { threw = true; }
    const elapsed = Date.now() - start;
    expect(threw).toBe(true);
    expect(elapsed).toBeLessThan(5000);
    delete process.env.AI_BASE_URL;
    delete process.env.AI_TIMEOUT_MS;
    server.close();
  }, 15000);
});

describe('seed restart safety', () => {
  it('seeds an empty database and leaves a populated one untouched', () => {
    const dir = '/tmp/lablink-seedtest-' + Date.now();
    execFileSync('npm', ['run', 'seed', '--silent'], { env: { ...process.env, DATA_DIR: dir }, timeout: 60000 });
    const out = execFileSync('npm', ['run', 'seed', '--silent'], { env: { ...process.env, DATA_DIR: dir }, timeout: 60000, encoding: 'utf8' });
    expect(out).toContain('already populated');
  }, 120000);
});
