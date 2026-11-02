import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import StaffNav from './StaffNav.jsx';

export default function OpsReport() {
  const nav = useNavigate();
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');
  async function load() {
    setErr('');
    const r = await api('/api/staff/ops-report');
    if (r.status === 401) return nav('/staff');
    if (r.status === 403) return nav('/staff/forbidden');
    if (!r.ok) return setErr('The report could not be loaded. Please try again.');
    setD(r.data);
  }
  React.useEffect(() => { load(); }, []);
  if (err) return (
    <div>
      <BrandHeader />
      <StaffNav />
      <div className="card mt-10 text-center">
        <p className="mb-4 text-base text-slate-700">{err}</p>
        <button className="btn" onClick={load}>Retry</button>
      </div>
    </div>
  );
  if (!d) return <div className="py-20 text-center text-lg text-slate-400">Loading…</div>;
  const card = (label, value) => (
    <div className="card p-4 text-center">
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
return (
    <div>
      <BrandHeader />
      <StaffNav />
      <h2 className="mb-4 text-xl font-bold text-slate-900">Delivery & access report</h2>
      <p className="mb-2 text-sm font-medium text-slate-500">Report notifications (WhatsApp/SMS with the report link)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {card('Links sent', d.notif.linksSent)}
        {card('Delivered', d.notif.delivered)}
        {card('Failed', d.notif.failed)}
        {card('In progress', d.notif.inFlight)}
      </div>
      <p className="mb-2 mt-5 text-sm font-medium text-slate-500">Access</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {card('Report views', d.views)}
        {card('PDF downloads', d.downloads)}
        {card('Open callbacks', d.openCallbacks)}
        {card('OTP messages', d.otpMessages)}
      </div>
      <div className="card mt-5 p-0">
        <table className="w-full text-left text-base">
          <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-5 py-3 font-medium">Day</th><th className="px-5 py-3 font-medium">Report links sent</th></tr></thead>
          <tbody>
            {d.daily.map((r) => <tr key={r.day} className="border-b border-slate-100 last:border-0"><td className="px-5 py-2.5">{r.day}</td><td className="px-5 py-2.5">{r.messages}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
