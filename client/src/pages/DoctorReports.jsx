import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import { FlagBadge } from './ReportView.jsx';

export default function DoctorReports() {
  const nav = useNavigate();
  const [rows, setRows] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => { (async () => { const r = await api('/api/doctor/reports'); if (!r.ok) return nav('/doctor'); setRows(r.data.reports); })(); }, []);
  if (!rows) return <div className="py-20 text-center text-lg text-slate-400">Loading…</div>;
  return (
    <div>
      <BrandHeader />
      <h2 className="mb-4 text-xl font-bold text-slate-900">Your patients' reports - last 90 days</h2>
      {!open ? (
        <div className="space-y-2">
          {rows.length === 0 && <div className="card text-slate-500">No reports in the last 90 days.</div>}
          {rows.map((r) => (
            <button key={r.id} className="card flex w-full items-center justify-between text-left hover:border-brand-600"
              onClick={async () => { const d = await api(`/api/doctor/orders/${r.id}`); if (d.ok) setOpen(d.data); }}>
              <div>
                <div className="text-lg font-semibold text-slate-900">{r.patient_name} <span className="text-sm font-normal text-slate-400">{r.age}/{r.sex}</span></div>
                <div className="text-base text-slate-500">{r.order_code} · {(r.signed_at || '').slice(0, 10)}</div>
              </div>
              <span className="text-slate-300">›</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button className="btn-ghost mb-4" onClick={() => setOpen(null)}>← Back</button>
          <div className="card divide-y divide-slate-100 p-0">
            {open.results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium text-slate-800">{r.parameter}</div>
                  <div className="text-sm text-slate-400">{r.reference_range || '-'} {r.unit || ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-slate-900">{r.value} <span className="text-sm font-normal text-slate-400">{r.unit}</span></div>
                  <FlagBadge flag={r.flag} lang="en" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
