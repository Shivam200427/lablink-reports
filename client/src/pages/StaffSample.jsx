import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import StaffNav from './StaffNav.jsx';

// Weekly AI-summary quality sample (pathologist reviews up to 50/week).
export default function StaffSample() {
  const nav = useNavigate();
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => { (async () => {
    const me = await api('/api/staff/me');
    if (me.status === 401) return nav('/staff');
    if (me.status === 403) return nav('/staff/forbidden');
    const r = await api('/api/staff/summary-sample');
    if (r.ok) setRows(r.data.sample);
  })(); }, []);

  async function review(id, verdict) {
    const r = await api(`/api/staff/summary-sample/${id}/review`, { method: 'POST', body: { verdict } });
    if (r.ok) setRows(rows.map((x) => (x.id === id ? { ...x, my_verdict: verdict } : x)));
  }

  const done = rows ? rows.filter((r) => r.my_verdict).length : 0;
  return (
    <div>
      <BrandHeader />
      <StaffNav />
      <h2 className="mb-1 text-xl font-bold text-slate-900">Weekly summary sample</h2>
      <p className="mb-4 text-base text-slate-500">
        Random sample of up to 50 summaries from the last 7 days. Reviewed {done}/{rows ? rows.length : 0}.
      </p>
      {!rows && <p className="text-slate-400">Loading...</p>}
      {rows && rows.length === 0 && <p className="text-slate-400">No summaries generated this week yet.</p>}
      <div className="space-y-3">
        {(rows || []).map((r) => (
          <div key={r.id} className="card">
            <div className="mb-1 flex items-center justify-between">
              <div className="font-semibold text-slate-800">{r.parameter} <span className="text-sm font-normal text-slate-400">({r.flag})</span></div>
              <span className="chip bg-slate-100 text-slate-500">{r.engine}</span>
            </div>
            <div className="mb-1 text-sm text-slate-400">{r.order_code} - {r.patient_name} - value {r.value} {r.unit} (range {r.reference_range})</div>
            <p className="mb-2 text-lg leading-relaxed text-slate-700">{r.lang_en}</p>
            {r.my_verdict ? (
              <p className={`text-base font-semibold ${r.my_verdict === 'ok' ? 'text-brand-700' : 'text-red-600'}`}>
                Marked: {r.my_verdict === 'ok' ? 'OK' : 'Needs fix'}
              </p>
            ) : (
              <div className="flex gap-2">
                <button className="btn px-4 py-1.5 text-base" onClick={() => review(r.id, 'ok')}>OK</button>
                <button className="btn-ghost px-4 py-1.5 text-base text-red-600" onClick={() => review(r.id, 'needs_fix')}>Needs fix</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
