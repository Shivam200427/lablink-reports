import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import StaffNav from './StaffNav.jsx';
import { formatIST } from '../dates.js';

// Whole-lab message log. Entries marked "mock" are simulated - no real
// message ever left the box; "delivered" on a mock entry is the simulation
// ticking, not a carrier receipt. Entries marked "provider" were attempted
// via the real SMS provider and show the provider's own answer. This is
// where front desk reads a patient's or doctor's OTP in the demo.
export default function StaffOutbox() {
  const nav = useNavigate();
  const [messages, setMessages] = React.useState([]);
  const [mobile, setMobile] = React.useState('');
  const [kind, setKind] = React.useState('');

  React.useEffect(() => { (async () => { const r = await api('/api/staff/me'); if (r.status === 401) return nav('/staff');
      if (r.status === 403) return nav('/staff/forbidden'); })(); }, []);

  async function load(m) {
    const q = m && /^\d{10}$/.test(m) ? `?mobile=${m}` : '';
    const r = await api(`/api/staff/outbox${q}`);
    if (r.ok) setMessages(r.data.messages);
  }
  React.useEffect(() => { load(); }, []);

  const kinds = [...new Set(messages.map((m) => m.kind))];
  const shown = kind ? messages.filter((m) => m.kind === kind) : messages;

  return (
    <div>
      <BrandHeader />
      <StaffNav />
      <h2 className="mb-1 text-xl font-bold text-slate-900">Messages</h2>
      <p className="mb-3 text-sm text-slate-500">Message times are shown in India Standard Time (IST).</p>
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); load(mobile); }}>
        <input className="input" inputMode="numeric" maxLength={10} placeholder="Filter by mobile (10 digits)"
          value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
        <button className="btn whitespace-nowrap px-4 text-base">Find</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <button onClick={() => setKind('')} className={`rounded-lg border px-3 py-1 ${!kind ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600'}`}>All</button>
        {kinds.map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-lg border px-3 py-1 ${kind === k ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600'}`}>{k}</button>
        ))}
      </div>
      <div className="space-y-2">
        {shown.map((m) => (
          <div key={m.id} className="card py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 text-sm text-slate-500">{m.to_mobile} · {m.channel}<br /><time dateTime={(m.created_at || '').replace(' ', 'T') + 'Z'}>{formatIST(m.created_at)}</time></div>
              <span className={`chip ${m.provider ? 'bg-sky-100 text-sky-800' : m.status === 'delivered' ? 'bg-brand-100 text-brand-800' : m.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{m.provider ? `provider · ${m.status}` : `mock · ${m.status}`}</span>
            </div>
            <div className="mt-1 break-words text-base text-slate-800">{m.body}</div>
            {m.provider_status && <div className="mt-1 text-sm text-slate-500">provider said: {m.provider_status}</div>}
          </div>
        ))}
        {shown.length === 0 && <p className="text-base text-slate-500">No messages yet.</p>}
      </div>
    </div>
  );
}
