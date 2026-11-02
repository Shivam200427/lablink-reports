import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import StaffNav from './StaffNav.jsx';

export default function StaffImport() {
  const nav = useNavigate();
  const [report, setReport] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [orders, setOrders] = React.useState([]);
  const [signResult, setSignResult] = React.useState('');

  React.useEffect(() => { (async () => { const r = await api('/api/staff/me'); if (r.status === 401 || r.status === 403) nav('/staff'); })(); }, []);

  async function loadOrders() {
    const r = await api('/api/staff/orders?status=processing');
    if (r.ok) setOrders(r.data.orders);
  }
  React.useEffect(() => { loadOrders(); }, []);

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setReport(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await api('/api/staff/import', { method: 'POST', body: fd });
    setBusy(false);
    setReport(r.ok ? r.data : { errors: ['Import failed'] });
    loadOrders();
  }
  async function signoff(o) {
    setBusy(true); setSignResult('');
    const r = await api(`/api/staff/orders/${o.id}/signoff`, { method: 'POST', body: {} });
    setBusy(false);
    setSignResult(r.ok
      ? `${o.order_code} signed off: ${r.data.status}, link sent, ${r.data.summaries} summaries, ${r.data.critical} critical callback(s).`
      : (r.data?.error || 'Failed'));
    loadOrders();
  }
  return (
    <div>
      <BrandHeader />
      <StaffNav />
      <div className="space-y-5">
        <div className="card">
          <h2 className="mb-2 text-xl font-bold text-slate-900">Import LIS CSV export</h2>
          <p className="mb-4 text-base text-slate-500">Upload the export file from the lab information system. New rows are flagged against reference ranges automatically.</p>
          <input type="file" accept=".csv" onChange={upload} className="block w-full text-base" disabled={busy} />
          {report && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-base">
              <div>{report.rows} rows read · {report.ordersTouched} orders touched · {report.newOrders} new orders · {report.newPatients} new patients</div>
              {report.errors?.length > 0 && <ul className="mt-2 list-disc pl-5 text-red-600">{report.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="mb-2 text-xl font-bold text-slate-900">Awaiting sign-off ({orders.length})</h2>
          <p className="mb-4 text-base text-slate-500">Processing orders from the LIS. Signing off sends the patient a secure 72-hour link on WhatsApp automatically.</p>
          {signResult && <p className="mb-3 rounded-lg bg-brand-50 px-4 py-2 text-base text-brand-800">{signResult}</p>}
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-800">
                    {o.order_code}
                    {o.critical > 0 && <span className="chip ml-2 bg-red-100 text-red-800">{o.critical} critical</span>}
                    {o.no_range > 0 && <span className="chip ml-2 border border-slate-200 bg-slate-50 text-slate-500">{o.no_range} no range</span>}
                    {o.critical === 0 && o.flagged > 0 && <span className="chip ml-2 bg-amber-100 text-amber-800">{o.flagged} out of range</span>}
                  </div>
                  <div className="text-sm text-slate-500">{o.patient_name} · {o.doctor_name || 'no referring doctor'} · {(o.ordered_at || '').slice(0, 10)}</div>
                </div>
                <button className="btn whitespace-nowrap px-4 text-base" disabled={busy} onClick={() => signoff(o)}>Sign off</button>
              </div>
            ))}
            {orders.length === 0 && <p className="text-base text-slate-500">Nothing awaiting sign-off. Import a CSV above to add orders.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
