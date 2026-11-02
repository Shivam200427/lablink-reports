import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import { StaffNav } from './StaffLogin.jsx';

const emptyResult = () => ({ parameter: '', value: '', unit: '', referenceRange: '' });

export default function StaffNewOrder() {
  const nav = useNavigate();
  const [patientName, setPatientName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [age, setAge] = React.useState('');
  const [sex, setSex] = React.useState('');
  const [doctorName, setDoctorName] = React.useState('');
  const [rows, setRows] = React.useState([emptyResult()]);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [err, setErr] = React.useState('');

  React.useEffect(() => { (async () => { const r = await api('/api/staff/me'); if (!r.ok) nav('/staff'); })(); }, []);

  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const valid = patientName.trim().length >= 2 && mobile.length === 10
    && rows.every((r) => r.parameter.trim().length >= 2 && r.value.trim().length > 0);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api('/api/staff/orders', { method: 'POST', body: { patientName, mobile, age: age || undefined, sex: sex || undefined, doctorName: doctorName || undefined, results: rows } });
    setBusy(false);
    if (!r.ok) return setErr(r.data?.error === 'invalid_mobile' ? 'Enter a valid 10-digit mobile number.' : r.data?.error === 'invalid_result' ? 'Every test row needs a parameter and a result value.' : 'Could not create the order. Check the entries and try again.');
    setDone(r.data);
  }

  if (done) return (
    <div>
      <BrandHeader />
      <StaffNav />
      <div className="card text-center">
        <div className="mb-2 text-2xl font-bold text-brand-700">Order {done.orderCode} created</div>
        <p className="mb-4 text-lg text-slate-600">It is waiting for the pathologist's review. After sign-off the patient gets the secure report link automatically.</p>
        <a href="/staff/import" className="btn inline-block">Go to sign-off</a>
        <button className="btn-ghost ml-2" onClick={() => { setDone(null); setRows([emptyResult()]); setPatientName(''); setMobile(''); setAge(''); setSex(''); setDoctorName(''); }}>New entry</button>
      </div>
    </div>
  );

  return (
    <div>
      <BrandHeader />
      <StaffNav />
      <div className="card">
        <h1 className="mb-1 text-xl font-bold">Register a walk-in patient</h1>
        <p className="mb-4 text-base text-slate-500">For a patient at the desk right now - no CSV needed. The pathologist signs the report next; delivery is automatic.</p>
        <form onSubmit={submit}>
          <label className="label">Patient full name</label>
          <input className="input mb-3" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Full name as on the requisition" />
          <label className="label">Mobile number</label>
          <input className="input mb-3" inputMode="numeric" maxLength={10} placeholder="90000 00001" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <label className="label">Age (optional)</label>
              <input className="input" inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="flex-1">
              <label className="label">Sex (optional)</label>
              <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">-</option><option value="F">F</option><option value="M">M</option><option value="O">O</option>
              </select>
            </div>
          </div>
          <label className="label">Referring doctor (optional)</label>
          <input className="input mb-4" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Dr. ..." />
          <div className="mb-2 text-base font-semibold">Test results</div>
          {rows.map((r, i) => (
            <div key={i} className="mb-3 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Test {i + 1}</span>
                {rows.length > 1 && <button type="button" className="text-sm text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>}
              </div>
              <label className="label">Parameter</label>
              <input className="input mb-2" placeholder="e.g. Haemoglobin" value={r.parameter} onChange={(e) => setRow(i, 'parameter', e.target.value)} />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="label">Value</label>
                  <input className="input" value={r.value} onChange={(e) => setRow(i, 'value', e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="label">Unit (optional)</label>
                  <input className="input" value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} />
                </div>
              </div>
              <label className="label mt-2">Reference range (optional)</label>
              <input className="input" placeholder="e.g. 12.0-15.5" value={r.referenceRange} onChange={(e) => setRow(i, 'referenceRange', e.target.value)} />
            </div>
          ))}
          <button type="button" className="btn-ghost mb-4" onClick={() => setRows([...rows, emptyResult()])}>+ Add another test</button>
          {err && <p className="mb-3 text-base text-red-600">{err}</p>}
          <button className="btn w-full" disabled={busy || !valid}>{busy ? 'Saving...' : 'Create order'}</button>
        </form>
      </div>
    </div>
  );
}
