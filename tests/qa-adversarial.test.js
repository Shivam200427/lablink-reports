import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
process.env.DATA_DIR='/tmp/lablink-qa-'+Date.now();
process.env.BASE_URL='http://localhost:3000';
let app,db,requestOTP,verifyOTP;
beforeAll(async()=>{({app}=await import('../server/index.js'));({db}=await import('../server/db.js'));({requestOTP,verifyOTP}=await import('../server/otp.js'));});
const code=m=>db.prepare("SELECT body FROM outbox WHERE to_mobile=? ORDER BY id DESC LIMIT 1").get(m).body.match(/OTP is (\d{6})/)[1];
describe('isolated adversarial QA',()=>{
 it('consumes a valid OTP once under two concurrent verifications',async()=>{
  const m='9600000001';await requestOTP(m,'doctor');const c=code(m);
  const r=await Promise.all([verifyOTP(m,c,'doctor'),verifyOTP(m,c,'doctor')]);
  expect(r.filter(x=>x.ok)).toHaveLength(1);
 });
 it('rejects malformed non-integral age rather than silently truncating',async()=>{
  for(const age of ['45years','1.5',{},[], 'NaN',121,-1]){
   const r=await request(app).post('/api/auth/patient/register').send({consent:true,fullName:'QA Synthetic',mobile:'9600000002',age});
   expect(r.status,JSON.stringify(age)).toBe(400);
  }
 });
 it('returns a client error for malformed JSON and oversized JSON',async()=>{
  const a=await request(app).post('/api/auth/patient/register').set('Content-Type','application/json').send('{bad');
  expect(a.status).toBe(400);
  const b=await request(app).post('/api/auth/patient/register').send({x:'a'.repeat(1100000)});
  expect(b.status).toBe(413);
 });
 it('does not crash on bounded invalid route IDs, strings or injection-shaped input',async()=>{
  for(const id of ['-1','NaN','1e309',"1 OR 1=1",'<script>']){
    const r=await request(app).get('/api/patient/orders/'+encodeURIComponent(id));expect(r.status).toBe(401);expect(r.text).not.toContain('stack');
  }
  const r=await request(app).post('/api/auth/staff/login').send({username:"' OR 1=1 --",password:'bogus'});expect(r.status).toBe(401);
 });
 it('expired and wrong-purpose OTPs never verify',async()=>{
  const m='9600000003';await requestOTP(m,'doctor');const c=code(m);
  expect((await verifyOTP(m,c,'login')).error).toBe('no_otp');
  db.prepare("UPDATE otps SET expires_at='2000-01-01 00:00:00' WHERE mobile=?").run(m);
  expect((await verifyOTP(m,c,'doctor')).error).toBe('expired');
 });
});
