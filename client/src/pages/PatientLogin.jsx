import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { BrandHeader, LangPicker, LangCtx } from '../App.jsx';

export default function PatientLogin() {
  const { lang, setLang } = React.useContext(LangCtx);
  const nav = useNavigate();
  const [step, setStep] = React.useState('mobile'); // mobile | otp | consent
  const [mobile, setMobile] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  async function sendOtp(e) {
    e.preventDefault(); setBusy(true); setError('');
    const r = await api('/api/auth/patient/request-otp', { method: 'POST', body: { mobile } });
    setBusy(false);
    if (r.status === 404) return setError(t(lang, 'notRegistered'));
    if (!r.ok) return setError(t(lang, 'wrongOtp'));
    setStep('otp');
  }
  async function verify(e, consent) {
    e?.preventDefault(); setBusy(true); setError('');
    const r = await api('/api/auth/patient/verify', { method: 'POST', body: { mobile, code, ...(consent ? { consent: true } : {}) } });
    setBusy(false);
    if (!r.ok) return setError(t(lang, 'wrongOtp'));
    if (r.data.needsConsent) return setStep('consent');
    nav('/home');
  }
  return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      <div className="card mt-10">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">LabLink</h1>
        <p className="mb-6 text-lg text-slate-500">{t(lang, 'appTag')}</p>
        {step === 'mobile' && (
          <form onSubmit={sendOtp}>
            <label className="label">{t(lang, 'enterMobile')}</label>
            <input className="input mb-4" inputMode="numeric" maxLength={10} placeholder="90000 00001"
              value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
            {error && <p className="mb-3 text-base text-red-600">{error}</p>}
            <button className="btn w-full" disabled={busy || mobile.length !== 10}>{t(lang, 'sendOtp')}</button>
          </form>
        )}
        {step === 'otp' && (
          <form onSubmit={(e) => verify(e, false)}>
            <label className="label">{t(lang, 'enterOtp')}</label>
            <input className="input mb-4 tracking-[0.5em]" inputMode="numeric" maxLength={6} placeholder="------"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            {error && <p className="mb-3 text-base text-red-600">{error}</p>}
            <button className="btn w-full" disabled={busy || code.length !== 6}>{t(lang, 'verify')}</button>
          </form>
        )}
        {step === 'consent' && (
          <form onSubmit={(e) => verify(e, true)}>
            <p className="mb-5 rounded-xl bg-brand-50 p-4 text-lg leading-relaxed text-slate-700">{t(lang, 'consentText')}</p>
            <button className="btn w-full" disabled={busy}>{t(lang, 'agree')}</button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        <a className="underline" href="/staff">Staff</a> · <a className="underline" href="/doctor">Doctors</a>
      </p>
    </div>
  );
}
