import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import { StaffNav } from './StaffLogin.jsx';

// Whole-lab message log: every mocked WhatsApp/SMS/OTP with its simulated
// delivery status. This is where front desk reads a patient's or doctor's
// OTP in the demo (no real SMS leaves the box).
export default function StaffOutbox() {
  const nav = useNavigate();
  const [messages, setMessages] = React.useState([]);
  const [mobile, setMobile] = React.useState('');
  const [kind, setKind] = React.useState('');

  React.useEffect(() => { (async () => { const r = await api('/api/staff/me'); if (!r.ok) nav('/staff'); })(); }, []);

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
      <h2 className="mb-3 text-xl font-bold text-slate-900">Messages</h2>
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
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">{m.to_mobile} · {m.channel} · {(m.created_at || '').slice(0, 16)}</div>
              <span className={`chip ${m.status === 'delivered' ? 'bg-brand-100 text-brand-800' : m.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{m.status}</span>
            </div>
            <div className="mt-1 text-base text-slate-800">{m.body}</div>
          </div>
        ))}
        {shown.length === 0 && <p className="text-base text-slate-500">No messages yet.</p>}
      </div>
    </div>
  );
}
