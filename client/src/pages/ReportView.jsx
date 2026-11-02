import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { BrandHeader, LangPicker, LangCtx } from '../App.jsx';

export function FlagBadge({ flag, lang }) {
  if (flag === 'normal') return <span className="chip bg-slate-100 text-slate-500">{t(lang, 'normal')}</span>;
  if (flag === 'low') return <span className="chip bg-amber-100 text-amber-800">{t(lang, 'low')}</span>;
  if (flag === 'high') return <span className="chip bg-orange-100 text-orange-800">{t(lang, 'high')}</span>;
  if (flag === 'critical') return <span className="chip bg-red-100 text-red-800">{t(lang, 'critical')}</span>;
  return <span className="chip bg-slate-50 text-slate-400 border border-slate-200">{t(lang, 'notAssessed')}</span>;
}

export function EngineBadge({ engine, lang }) {
  if (!engine) return null;
  const key = engine === 'ai' ? 'engineAi' : engine === 'ai+template' ? 'engineMixed' : 'engineTemplate';
  return <span className="chip bg-slate-100 text-slate-500">{t(lang, key)}</span>;
}

export function ReportBody({ order, results, hasPdf, pdfUrl, lang, onFlag }) {
  const [flaggedIds, setFlaggedIds] = React.useState(new Set());
  const summaries = results.filter((r) => r.summary_id);
  const hasCritical = results.some((r) => r.flag === 'critical');
  const summaryText = (r) => r[`lang_${lang}`] || r.lang_en;
  return (
    <div className="space-y-5">
      <div className="card">
        <div className="mb-1 text-2xl font-bold text-slate-900">{order.order_code}</div>
        <div className="text-lg text-slate-500">
          {order.patient_name} · {order.age}/{order.sex} · {t(lang, 'doctor')}: {order.doctor_name || '-'}
        </div>
        <div className="text-base text-slate-400">{t(lang, 'date')}: {(order.signed_at || order.ordered_at || '').slice(0, 10)}</div>
        {summaries.length > 0 && (
          <a href="#simple-explanation" className="mt-2 inline-block text-base font-medium text-brand-700 underline">{t(lang, 'skipToSummary')} &darr;</a>
        )}
      </div>
      {hasCritical && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-lg leading-relaxed text-red-800">{t(lang, 'criticalNote')}</div>
      )}
      <div className="card divide-y divide-slate-100 p-0">
        {results.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="font-medium text-slate-800">{r.parameter}</div>
              <div className="text-sm text-slate-400">{r.reference_range || '-'} {r.unit || ''}</div>
            </div>
            <div className="text-right">
              <div className={`text-lg ${r.flag === 'normal' ? 'text-slate-700' : 'font-bold text-slate-900'}`}>{r.value} <span className="text-sm font-normal text-slate-400">{r.unit}</span></div>
              <FlagBadge flag={r.flag} lang={lang} />
            </div>
          </div>
        ))}
      </div>
      {summaries.length > 0 && (
        <div className="card" id="simple-explanation">
          <h3 className="mb-1 text-lg font-bold text-slate-900">{t(lang, 'summaryTitle')}</h3>
          <p className="mb-3 text-base leading-snug text-slate-500">{t(lang, 'summaryDisclaimer')}</p>
          <div className="space-y-4">
            {summaries.map((r) => (
              <div key={r.id} className="rounded-xl bg-brand-50 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{r.parameter}</span>
                  <EngineBadge engine={r.engine} lang={lang} />
                </div>
                <p className="text-lg leading-relaxed text-slate-700">{summaryText(r)}</p>
                {onFlag && (
                  <button
                    className="mt-2 text-sm font-medium text-slate-400 underline disabled:no-underline"
                    disabled={flaggedIds.has(r.summary_id)}
                    onClick={async () => { await onFlag(r.summary_id); setFlaggedIds(new Set(flaggedIds).add(r.summary_id)); }}>
                    {flaggedIds.has(r.summary_id) ? t(lang, 'flagged') : t(lang, 'flagWrong')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {summaries.length === 0 && results.length > 0 && results.every((r) => r.flag === 'normal') && (
        <div className="card text-base leading-relaxed text-slate-500">{t(lang, 'allNormalNote')}</div>
      )}
      {hasPdf && <a className="btn w-full" href={pdfUrl}>{t(lang, 'downloadPdf')}</a>}
    </div>
  );
}

export default function ReportView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { lang, setLang } = React.useContext(LangCtx);
  const [data, setData] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState('');

  async function load() {
    setLoadErr(''); setData(null);
    const r = await api(`/api/patient/orders/${id}`);
    if (r.status === 401 || r.status === 403) return nav('/');
    if (!r.ok) return setLoadErr(t(lang, 'genericError'));
    setData(r.data);
    const langPref = r.data.order.preferred_language;
    if (langPref && !localStorage.getItem('ll_lang')) setLang(langPref);
  }

  React.useEffect(() => { load(); }, [id]);

  if (loadErr) return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      <div className="card text-center">
        <p className="text-base text-red-600">{loadErr}</p>
        <button className="btn mt-4" onClick={load}>{t(lang, 'tryAgain')}</button>
      </div>
    </div>
  );

  if (!data) return <div className="py-20 text-center text-lg text-slate-400">Loading…</div>;
  return (
    <div>
      <BrandHeader right={<LangPicker lang={lang} setLang={setLang} />} />
      <ReportBody order={data.order} results={data.results} hasPdf={data.hasPdf}
        pdfUrl={`/api/patient/orders/${id}/pdf`} lang={lang}
        onFlag={async (sid) => api(`/api/patient/summaries/${sid}/flag`, { method: 'POST', body: {} })} />
    </div>
  );
}
