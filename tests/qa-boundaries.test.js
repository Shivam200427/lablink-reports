import {beforeAll,it,expect} from 'vitest';
import request from 'supertest';
process.env.DATA_DIR='/tmp/lablink-boundaries-'+Date.now();process.env.BASE_URL='http://localhost:3000';
let app,db,flagResult,signOffOrder,hashPassword;
beforeAll(async()=>{({app}=await import('../server/index.js'));({db}=await import('../server/db.js'));({flagResult}=await import('../server/flags.js'));({signOffOrder}=await import('../server/lis.js'));({hashPassword}=await import('../server/crypto.js'));db.prepare('INSERT INTO staff(username,password_hash,full_name,role) VALUES(?,?,?,?)').run('qa',hashPassword('pw'),'QA','frontdesk');});
it('concurrent desk orders get unique codes and complete rows',async()=>{
 const a=request.agent(app);await a.post('/api/auth/staff/login').send({username:'qa',password:'pw'});
 const b={contactVerified:true,patientName:'Concurrent Synthetic',mobile:'9600000080',results:[{parameter:'Haemoglobin',value:'11',referenceRange:'12-15'}]};
 const r=await Promise.all([a.post('/api/staff/orders').send(b),a.post('/api/staff/orders').send(b)]);
 expect(r.map(x=>x.status)).toEqual([200,200]);expect(new Set(r.map(x=>x.body.orderCode)).size).toBe(2);
});
it('non numeric qualified values and malformed ranges stay unknown',()=>{
 for(const v of ['4garbage','4.5.6','4e2','Infinity','<4','4 mmol/L'])expect(flagResult(v,'3-5')).toBe('unknown');
 for(const r of ['5-3','3t5','3---5'])expect(flagResult('4',r)).toBe('unknown');
 expect(flagResult('-2.5','-4--1')).toBe('normal');
});
it('empty order cannot be signed and published',async()=>{
 const pid=Number(db.prepare("INSERT INTO patients(full_name,mobile) VALUES('Empty','9600000081')").run().lastInsertRowid);
 const oid=Number(db.prepare("INSERT INTO orders(order_code,patient_id) VALUES('ORD-NONE',?)").run(pid).lastInsertRowid);
 expect((await signOffOrder(oid,'QA')).error).toBe('no_results');
 expect(db.prepare('SELECT signed_at FROM orders WHERE id=?').get(oid).signed_at).toBeNull();
});
it('doctor direct access excludes processing, old and foreign assignments',async()=>{
 const did=Number(db.prepare("INSERT INTO doctors(full_name,mobile) VALUES('QA Doctor','9600000082')").run().lastInsertRowid);
 const pid=db.prepare('SELECT id FROM patients LIMIT 1').get().id;
 const ids=[];
 for(const [code,status,signed,doctor] of [['ORD-DOC-P','processing',null,did],['ORD-DOC-OLD','ready','2000-01-01 00:00:00',did],['ORD-DOC-OTHER','ready',new Date().toISOString().replace('T',' ').slice(0,19),null],['ORD-DOC-NEW','ready',new Date().toISOString().replace('T',' ').slice(0,19),did]])ids.push(Number(db.prepare('INSERT INTO orders(order_code,patient_id,doctor_id,status,signed_at) VALUES(?,?,?,?,?)').run(code,pid,doctor,status,signed).lastInsertRowid));
 const a=request.agent(app);await a.post('/api/auth/doctor/request-otp').send({mobile:'9600000082'});
 const code=db.prepare("SELECT body FROM outbox WHERE to_mobile='9600000082' ORDER BY id DESC LIMIT 1").get().body.match(/OTP is (\d{6})/)[1];
 expect((await a.post('/api/auth/doctor/verify').send({mobile:'9600000082',code})).status).toBe(200);
 for(const id of ids.slice(0,3))expect((await a.get('/api/doctor/orders/'+id)).status).toBe(404);
 expect((await a.get('/api/doctor/orders/'+ids[3])).status).toBe(200);
 const list=await a.get('/api/doctor/reports');expect(list.body.reports.map(x=>x.id)).toEqual([ids[3]]);
});
