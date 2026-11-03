import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const [protocol, secure, port] of [['http', false, 3197], ['https', true, 3198]]) {
  describe(`${protocol} session cookie configuration`, () => {
    it('sets and clears a matching cookie while preserving authenticated access', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'lablink-cookie-'));
      const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'test-cookie', PORT: String(port), DATA_DIR: dir, BASE_URL: `${protocol}://localhost:${port}`, DATABASE_URL: '', SEED_ON_BOOT: 'true' }, stdio: 'ignore' });
      try {
        const base = `http://127.0.0.1:${port}`;
        for (let i=0;i<100;i++) {
          try { if ((await fetch(base+'/api/health')).ok) break; } catch {}
          await new Promise(r=>setTimeout(r,100));
        }
        // Seed fixture is explicitly synthetic and isolated in a temporary DB.
        const { spawnSync } = await import('node:child_process');
        const seed=spawnSync(process.execPath,['server/seed.js'],{ env:{ ...process.env, DATA_DIR:dir, DATABASE_URL:'' },encoding:'utf8'});
        expect(seed.status).toBe(0);
        const login=await request(base).post('/api/auth/staff/login').send({ username:'frontdesk', password:'Lab@2026' });
        expect(login.status).toBe(200);
        const cookie=login.headers['set-cookie'][0];
        expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax');
        expect(cookie.includes('; Secure')).toBe(secure);
        expect((await request(base).get('/api/staff/outbox').set('Cookie',cookie.split(';')[0])).status).toBe(200);
        const logout=await request(base).post('/api/auth/staff/logout').set('Cookie',cookie.split(';')[0]);
        expect(logout.status).toBe(200);
        expect(logout.headers['set-cookie'][0].includes('; Secure')).toBe(secure);
        expect((await request(base).get('/api/staff/outbox').set('Cookie',cookie.split(';')[0])).status).toBe(401);
      } finally { child.kill('SIGTERM'); await new Promise(r=>child.once('exit',r)); rmSync(dir,{recursive:true,force:true}); }
    }, 20000);
  });
}
