import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import { StaffNav } from './StaffLogin.jsx';

export default function StaffTasks() {
  const nav = useNavigate();
  const [data, setData] = React.useState(null);
  const load = async () => {
    const r = await api('/api/staff/tasks');
    if (!r.ok) return nav('/staff');
    setData(r.data);
  };
  React.useEffect(() => { load(); }, []);
  if (!data) return <div className="py-20 text-center text-lg text-slate-400">Loading…</div>;
  return (
    <div>
      <BrandHeader />
      <StaffNav />
      <div className="space-y-5">
        <div className="card">
          <h2 className="mb-3 text-xl font-bold text-slate-900">Critical value callbacks</h2>
          {data.callbacks.length === 0 && <p className="text-slate-500">No callbacks.</p>}
          <div className="space-y-2">
            {data.callbacks.map((c) => (
              <div key={c.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${c.status === 'open' ? 'border-red-200 bg-red-50' : 'border-slate-100'}`}>
                <div>
                  <div className="font-semibold text-slate-800">{c.order_code} · {c.patient_name} · {c.mobile}</div>
                  <div className="text-sm text-slate-600">{c.reason}</div>
                  <div className="text-xs text-slate-400">{c.created_at}</div>
                </div>
                {c.status === 'open'
                  ? <button className="btn px-4 py-2 text-base" onClick={async () => { await api(`/api/staff/tasks/${c.id}/done`, { method: 'POST', body: {} }); load(); }}>Mark called</button>
                  : <span className="chip bg-slate-100 text-slate-500">done</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-1 text-xl font-bold text-slate-900">Flagged explanations</h2>
          <p className="mb-3 text-sm text-slate-500">Patients flagged these AI explanations as wrong. Pathologist reviews them weekly.</p>
          {data.flags.length === 0 && <p className="text-slate-500">Nothing flagged.</p>}
          <div className="space-y-2">
            {data.flags.map((f) => (
              <div key={f.id} className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="font-semibold text-slate-800">{f.parameter} = {f.value} {f.unit} · {f.order_code} · {f.patient_name}</div>
                <div className="mt-1 text-sm text-slate-600">{f.lang_en}</div>
                {f.reason && <div className="mt-1 text-sm italic text-slate-500">Patient note: {f.reason}</div>}
                <div className="mt-2">
                  {f.status === 'open'
                    ? <button className="btn-ghost" onClick={async () => { await api(`/api/staff/summary-flags/${f.id}/review`, { method: 'POST', body: {} }); load(); }}>Mark reviewed</button>
                    : <span className="chip bg-slate-100 text-slate-500">reviewed</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
