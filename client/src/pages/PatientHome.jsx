import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { BrandHeader, LangPicker, LangCtx } from '../App.jsx';

export default function PatientHome() {
  const justRegistered = useLocation().state?.justRegistered;
  const { lang, setLang } = React.useContext(LangCtx);
  const nav = useNavigate();
  const [me, setMe] = React.useState(null);
  const [orders, setOrders] = React.useState(null);
  const [person, setPerson] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState('');

  async function load() {
    setLoadErr(''); setMe(null); setOrders(null);
    const r = await api('/api/patient/me');
    if (r.status === 401) return nav('/');
    if (!r.ok) return setLoadErr(t(lang, 'genericError'));
    setMe(r.data);
    if (r.data.patients.length === 1) setPerson(r.data.patients[0]);
    const o = await api('/api/patient/orders');
    if (!o.ok) return setLoadErr(t(lang, 'genericError'));
    setOrders(o.data?.orders || []);
  }

  React.useEffect(() => { load(); }, []);

  if (loadErr) return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      <div className="card text-center">
        <p className="text-base text-red-600">{loadErr}</p>
        <button className="btn mt-4" onClick={load}>{t(lang, 'tryAgain')}</button>
      </div>
    </div>
  );

  if (!me || !orders) return <div className="py-20 text-center text-lg text-slate-400">{t(lang, 'loading')}</div>;
  const visible = person ? orders.filter((o) => o.patient_id === person.id) : [];

  return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      {!person ? (
        <div className="card">
          <h2 className="mb-4 text-xl font-bold text-slate-900">{t(lang, 'familyPick')}</h2>
          <div className="space-y-3">
            {me.patients.map((p) => (
              <button key={p.id} onClick={() => setPerson(p)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-left text-lg font-medium hover:border-brand-600">
                {p.full_name}<span className="text-slate-300">›</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">{person.full_name}</h2>
            {me.patients.length > 1 && (
              <button className="btn-ghost" onClick={() => setPerson(null)}>{t(lang, 'switchFamily')}</button>
            )}
          </div>
          <h3 className="mb-3 text-lg font-semibold text-slate-600">{t(lang, 'yourReports')}</h3>
          {visible.length === 0 && <div className="card text-lg text-slate-500">{t(lang, justRegistered ? 'registeredEmpty' : 'noReports')}</div>}
          <div className="space-y-3">
            {visible.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`}
                className="card flex items-center justify-between transition hover:border-brand-600">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{o.order_code}</div>
                  <div className="text-base text-slate-500">{o.doctor_name || ''} · {(o.signed_at || o.ordered_at || '').slice(0, 10)}</div>
                </div>
                <span className={`chip ${o.status === 'processing' ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-800'}`}>
                  {o.status === 'processing' ? t(lang, 'processing') : t(lang, 'ready')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
