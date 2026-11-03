import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { BrandHeader, LangPicker, LangCtx } from '../App.jsx';

export default function PatientRegister() {
  const { lang, setLang } = React.useContext(LangCtx);
  const nav = useNavigate();
  const [step, setStep] = React.useState('form'); // form | otp | consent
  const [fullName, setFullName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [age, setAge] = React.useState('');
  const [sex, setSex] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  async function register(e) {
    e.preventDefault(); setBusy(true); setError('');
    const r = await api('/api/auth/patient/register', { method: 'POST',
      body: { fullName, mobile, language: lang, age: age || undefined, sex: sex || undefined } });
    setBusy(false);
    if (r.status === 409) return setError(t(lang, 'alreadyRegistered'));
    if (r.status === 400) return setError(t(lang, r.data?.error === 'invalid_name' ? 'invalidName' : 'wrongOtp'));
    if (r.status === 429) return setError(t(lang, 'rateLimited'));
    if (!r.ok) return setError(t(lang, 'genericError'));
    setStep('otp');
  }
  async function verify(e, consent) {
    e?.preventDefault(); setBusy(true); setError('');
    const r = await api('/api/auth/patient/verify', { method: 'POST', body: { mobile, code, ...(consent ? { consent: true } : {}) } });
    setBusy(false);
    if (r.status === 400) return setError(t(lang, 'wrongOtp'));
    if (r.status === 429) return setError(t(lang, 'rateLimited'));
    if (!r.ok) return setError(t(lang, 'genericError'));
    if (r.data.needsConsent) return setStep('consent');
    nav('/home', { state: { justRegistered: true } });
  }
  return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      <div className="card mt-10">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">{t(lang, 'registerTitle')}</h1>
        {step === 'form' && (
          <form onSubmit={register}>
            <p className="mb-5 text-base leading-relaxed text-slate-500">{t(lang, 'registerIntro')}</p>
            <label className="label" htmlFor="patientregister-1">{t(lang, 'fullName')}</label>
            <input id="patientregister-1" className="input mb-4" maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <label className="label" htmlFor="patientregister-2">{t(lang, 'regMobile')}</label>
            <input id="patientregister-2" className="input mb-4" inputMode="numeric" maxLength={10} placeholder="90000 00001"
              value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
            <label className="label" htmlFor="patientregister-3">{t(lang, 'yourAge')}</label>
            <input id="patientregister-3" className="input mb-4" inputMode="numeric" maxLength={3}
              value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
            <label className="label" htmlFor="patientregister-4">{t(lang, 'yourSex')}</label>
            <select id="patientregister-4" className="input mb-4" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">-</option><option value="F">F</option><option value="M">M</option><option value="O">O</option>
            </select>
            {error && <p className="mb-3 text-base text-red-600">{error}</p>}
            <button className="btn w-full" disabled={busy || fullName.trim().length < 2 || mobile.length !== 10}>{t(lang, 'registerBtn')}</button>
          </form>
        )}
        {step === 'otp' && (
          <form onSubmit={(e) => verify(e, false)}>
            <label className="label" htmlFor="patientregister-5">{t(lang, 'enterOtp')}</label>
            <input id="patientregister-5" className="input mb-4 tracking-[0.5em]" inputMode="numeric" maxLength={6} placeholder="------"
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
        <a className="underline" href="/">{t(lang, 'verify')} / Login</a>
      </p>
    </div>
  );
}
