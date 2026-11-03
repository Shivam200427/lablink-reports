import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';

export default function DoctorLogin() {
  const nav = useNavigate();
  const [mobile, setMobile] = React.useState('');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState('mobile');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function send(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api('/api/auth/doctor/request-otp', { method: 'POST', body: { mobile } });
    setBusy(false);
    if (!r.ok) return setErr('This number is not registered as a referring doctor.');
    setStep('otp');
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api('/api/auth/doctor/verify', { method: 'POST', body: { mobile, code } });
    setBusy(false);
    if (!r.ok) return setErr('That code did not match.');
    nav('/doctor/reports');
  }
  return (
    <div>
      <BrandHeader />
      <div className="card mt-10">
        <h1 className="mb-5 text-2xl font-bold text-slate-900">Referring doctor sign in</h1>
        {step === 'mobile' ? (
          <form onSubmit={send}>
            <label className="label" htmlFor="doctorlogin-1">Registered mobile number</label>
            <input id="doctorlogin-1" className="input mb-4" inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
            {err && <p className="mb-3 text-base text-red-600">{err}</p>}
            <button className="btn w-full" disabled={busy || mobile.length !== 10}>Send OTP</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label className="label" htmlFor="doctorlogin-2">6-digit OTP</label>
            <input id="doctorlogin-2" className="input mb-4 tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            {err && <p className="mb-3 text-base text-red-600">{err}</p>}
            <button className="btn w-full" disabled={busy || code.length !== 6}>Verify</button>
          </form>
        )}
      </div>
    </div>
  );
}
