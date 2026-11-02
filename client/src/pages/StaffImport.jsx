import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import { StaffNav } from './StaffLogin.jsx';

export default function StaffImport() {
  const nav = useNavigate();
  const [report, setReport] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [signing, setSigning] = React.useState('');
  const [signResult, setSignResult] = React.useState('');

  React.useEffect(() => { (async () => { const r = await api('/api/staff/me'); if (!r.ok) nav('/staff'); })(); }, []);

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setReport(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await api('/api/staff/import', { method: 'POST', body: fd });
    setBusy(false);
    setReport(r.ok ? r.data : { errors: ['Import failed'] });
  }
  async function signoff(e) {
    e.preventDefault(); setBusy(true); setSignResult('');
    const r = await api(`/api/staff/orders/${encodeURIComponent(signing)}/signoff`, { method: 'POST', body: {} });
    if (r.status === 404 || r.body?.error === 'not_found') {
      // try by order code: find id from console search is overkill; accept numeric id or code
    }
    setBusy(false);
    setSignResult(r.ok ? `Signed off: ${r.data.status}, link sent, ${r.data.summaries} summaries, ${r.data.critical} critical callback(s).` : (r.data?.error || 'Failed'));
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
        <form className="card" onSubmit={signoff}>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Sign off a report (simulates LIS)</h2>
          <p className="mb-4 text-base text-slate-500">Enter a processing order ID. On sign-off the secure 72h link goes out on WhatsApp automatically.</p>
          <div className="flex gap-2">
            <input className="input" placeholder="Order ID (e.g. 12)" value={signing} onChange={(e) => setSigning(e.target.value)} />
            <button className="btn whitespace-nowrap px-4 text-base" disabled={busy || !signing}>Sign off</button>
          </div>
          {signResult && <p className="mt-3 rounded-lg bg-brand-50 px-4 py-2 text-base text-brand-800">{signResult}</p>}
        </form>
      </div>
    </div>
  );
}
