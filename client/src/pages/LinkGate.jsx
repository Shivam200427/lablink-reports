import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { BrandHeader, LangPicker, LangCtx } from '../App.jsx';
import { ReportBody } from './ReportView.jsx';

export default function LinkGate() {
  const { token } = useParams();
  const { lang, setLang } = React.useContext(LangCtx);
  const [info, setInfo] = React.useState(null);
  const [step, setStep] = React.useState('intro'); // intro | otp | report
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [report, setReport] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const r = await api(`/api/link/${token}`);
      setInfo(r.ok ? r.data : { error: r.data?.error || 'not_found' });
    })();
  }, [token]);

  if (!info) return <div className="py-20 text-center text-lg text-slate-400">Loading…</div>;

  async function sendOtp() {
    setBusy(true); setError('');
    await api(`/api/link/${token}/request-otp`, { method: 'POST', body: {} });
    setBusy(false); setStep('otp');
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setError('');
    const r = await api(`/api/link/${token}/verify`, { method: 'POST', body: { code } });
    if (!r.ok) { setBusy(false); return setError(t(lang, 'wrongOtp')); }
    const rep = await api(`/api/link/${token}/report`);
    setBusy(false);
    if (!rep.ok) return setError(t(lang, 'wrongOtp'));
    setReport(rep.data); setStep('report');
  }

  return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      {info.error && (
        <div className="card text-lg text-slate-600">
          {info.error === 'expired' ? t(lang, 'linkExpired') : 'Link not found.'}
          <div className="mt-4"><Link className="btn-ghost" to="/">LabLink</Link></div>
        </div>
      )}
      {!info.error && step === 'intro' && (
        <div className="card">
          <h2 className="mb-2 text-xl font-bold text-slate-900">{info.orderCode}</h2>
          <p className="mb-5 text-lg text-slate-600">{t(lang, 'linkIntro')} <b>{info.mobile}</b></p>
          <button className="btn w-full" onClick={sendOtp} disabled={busy}>{t(lang, 'sendOtp')}</button>
        </div>
      )}
      {!info.error && step === 'otp' && (
        <form className="card" onSubmit={verify}>
          <label className="label">{t(lang, 'enterOtp')}</label>
          <input className="input mb-4 tracking-[0.5em]" inputMode="numeric" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          {error && <p className="mb-3 text-base text-red-600">{error}</p>}
          <button className="btn w-full" disabled={busy || code.length !== 6}>{t(lang, 'verify')}</button>
        </form>
      )}
      {step === 'report' && report && (
        <ReportBody order={report.order} results={report.results} hasPdf={false} lang={lang} />
      )}
    </div>
  );
}
