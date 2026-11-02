import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';
import StaffNav from './StaffNav.jsx';

export default function StaffConsole() {
  const nav = useNavigate();
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [detail, setDetail] = React.useState(null);
  const [grantMobile, setGrantMobile] = React.useState('');
  const [grantRelation, setGrantRelation] = React.useState('');
  const [grantMsg, setGrantMsg] = React.useState('');

  async function grantAccess(patientId) {
    setGrantMsg('');
    const r = await api(`/api/staff/patients/${patientId}/access`, { method: 'POST', body: { mobile: grantMobile, relation: grantRelation } });
    if (r.ok) {
      setGrantMobile(''); setGrantRelation('');
      open(patientId);
    } else {
      setGrantMsg(r.data && r.data.error === 'already_granted' ? 'That number already has access.'
        : r.data && r.data.error === 'own_contact_mobile' ? 'That is the patient\'s own registered number.'
        : 'Could not grant access - check the 10-digit mobile.');
    }
  }

  async function revokeAccess(patientId, grantId) {
    const r = await api(`/api/staff/patients/${patientId}/access/${grantId}/revoke`, { method: 'POST' });
    if (r.ok) open(patientId);
  }
  const [msg, setMsg] = React.useState('');
  const [merges, setMerges] = React.useState([]);

  React.useEffect(() => { (async () => { const r = await api('/api/staff/me'); if (r.status === 401) return nav('/staff');
      if (r.status === 403) return nav('/staff/forbidden'); })(); }, []);
  React.useEffect(() => { loadMerges(); }, []);

  async function loadMerges() {
    const r = await api('/api/staff/merges');
    if (r.ok) setMerges(r.data.merges);
  }
  async function resolveMerge(id, action) {
    const r = await api(`/api/staff/merges/${id}/${action}`, { method: 'POST', body: action === 'confirm' ? { attested: true } : {} });
    if (r.ok) { loadMerges(); setMsg(action === 'confirm' ? 'Identity confirmed - the lab reports now show in the patient\'s account.' : 'Kept as separate patients.'); }
  }
  async function verifyContact(patientId) {
    const r = await api(`/api/staff/patients/${patientId}/verify-contact`, { method: 'POST', body: { attested: true } });
    if (r.ok) { setMsg('Contact number verified - the patient can now log in with OTP on it.'); open(patientId); }
  }

  async function search(e) {
    e?.preventDefault();
    const r = await api(`/api/staff/patients?q=${encodeURIComponent(q)}`);
    if (r.ok) setResults(r.data.patients);
  }
  async function open(id) {
    const r = await api(`/api/staff/patients/${id}`);
    if (r.ok) setDetail(r.data);
  }
  async function resend(outboxId) {
    await api('/api/staff/resend', { method: 'POST', body: { outboxId } });
    setMsg('Message re-queued.');
    if (detail) open(detail.patient.id);
  }
  async function resendLink(orderId) {
    await api(`/api/staff/orders/${orderId}/resend-link`, { method: 'POST', body: {} });
    setMsg('New 72h link sent.');
    if (detail) open(detail.patient.id);
  }

  return (
    <div>
      <BrandHeader />
      <StaffNav />
      <form className="mb-4 flex gap-2" onSubmit={search}>
        <input className="input" placeholder="Search patient name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn whitespace-nowrap px-4 text-base">Search</button>
      </form>
      {msg && <p className="mb-3 rounded-lg bg-brand-50 px-4 py-2 text-base text-brand-800">{msg}</p>}
      {!detail && merges.length > 0 && (
        <div className="card mb-4">
          <h3 className="mb-1 text-lg font-bold text-slate-900">Identity matches to confirm</h3>
          <p className="mb-3 text-sm text-slate-500">
            These lab records have the same name and number as a self-registered account.
            Reports stay separate until the lab confirms the person at the desk.
          </p>
          <div className="space-y-2">
            {merges.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2">
                <div className="text-sm text-slate-700">
                  <span className="font-medium">{m.lab_name}</span> (lab record) = <span className="font-medium">{m.self_name}</span> (self-registered, {m.self_mobile})?
                </div>
                <div className="flex gap-2">
                  <button className="btn px-3 py-1 text-sm" onClick={() => resolveMerge(m.id, 'confirm')}>Same person</button>
                  <button className="btn-ghost px-3 py-1 text-sm" onClick={() => resolveMerge(m.id, 'reject')}>Different people</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!detail && (
        <div className="space-y-2">
          {results.map((p) => (
            <button key={p.id} onClick={() => open(p.id)} className="card flex w-full items-center justify-between text-left hover:border-brand-600">
              <div>
                <div className="text-lg font-semibold text-slate-900">{p.full_name}</div>
                <div className="text-base text-slate-500">{p.age}/{p.sex} · {p.mobile} · {p.orders} orders</div>
              </div>
              <span className="text-slate-300">›</span>
            </button>
          ))}
        </div>
      )}
      {detail && (
        <div className="space-y-5">
          <button className="btn-ghost" onClick={() => setDetail(null)}>← Back</button>
          <div className="card">
            <div className="text-xl font-bold text-slate-900">{detail.patient.full_name}</div>
            <div className="text-base text-slate-500">{detail.patient.age}/{detail.patient.sex} · {detail.patient.mobile}</div>
          </div>
          <div className="card">
            <h3 className="mb-1 text-lg font-bold text-slate-900">Report access</h3>
            <p className="mb-3 text-sm text-slate-500">
              Only numbers listed here can see this patient's reports after mobile OTP.
              Nothing is granted by phone possession alone - every entry is a lab
              attestation or an OTP-verified self-registration, and all are logged.
            </p>
            {!detail.contactVerified && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-sm text-slate-700">
                  The contact number {detail.patient.mobile} is <span className="font-semibold">not verified</span>, so this
                  patient cannot log in yet. Verify it only with the patient at the desk.
                </p>
                <button className="btn px-3 py-1 text-sm" onClick={() => verifyContact(detail.patient.id)}>I verified this contact number</button>
              </div>
            )}
            <div className="mb-3 space-y-2">
              {(detail.familyAccess || []).length === 0 && <p className="text-sm text-slate-500">No number has access yet.</p>}
              {(detail.familyAccess || []).map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2">
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">{g.mobile}</span>
                    {g.kind === 'contact' && <span className="text-slate-400"> · registered contact · {g.granted_by_name ? `verified by ${g.granted_by_name}` : 'demo fixture (system)'}</span>}
                    {g.kind === 'self' && <span className="text-slate-400"> · self-registered (OTP verified)</span>}
                    {(!g.kind || g.kind === 'delegated') && <span className="text-slate-400">{g.relation ? ` · ${g.relation}` : ''} · granted by {g.granted_by_name}</span>}
                    <span className="text-slate-400"> · {(g.created_at || '').slice(0, 10)}</span>
                  </div>
                  <button className="text-sm font-medium text-red-600 underline" onClick={() => revokeAccess(detail.patient.id, g.id)}>Revoke</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-44" inputMode="numeric" maxLength={10} placeholder="Relative mobile"
                value={grantMobile} onChange={(e) => setGrantMobile(e.target.value.replace(/\D/g, ''))} />
              <input className="input w-40" maxLength={40} placeholder="Relation (e.g. son)"
                value={grantRelation} onChange={(e) => setGrantRelation(e.target.value)} />
              <button className="btn px-4 text-base" disabled={grantMobile.length !== 10}
                onClick={() => grantAccess(detail.patient.id)}>Grant access</button>
            </div>
            {grantMsg && <p className="mt-2 text-sm text-red-600">{grantMsg}</p>}
          </div>
          <div className="card">
            <h3 className="mb-3 text-lg font-bold text-slate-900">Orders</h3>
            <div className="space-y-2">
              {detail.orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <div>
                    <div className="font-semibold text-slate-800">{o.order_code} <span className={`chip ${o.status === 'processing' ? 'bg-amber-100 text-amber-800' : o.status === 'ready_critical' ? 'bg-red-100 text-red-800' : 'bg-brand-100 text-brand-800'}`}>{o.status}</span></div>
                    <div className="text-sm text-slate-500">{o.doctor_name || ''} · {(o.signed_at || o.ordered_at || '').slice(0, 10)}</div>
                  </div>
                  {o.status !== 'processing' && <button className="btn-ghost" onClick={() => resendLink(o.id)}>Resend link</button>}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="mb-3 text-lg font-bold text-slate-900">Messages & delivery</h3>
            <div className="space-y-2">
              {detail.messages.length === 0 && <p className="text-slate-500">No messages yet.</p>}
              {detail.messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{m.channel} · {m.kind}</span>
                    <span className={`chip ${m.provider ? 'bg-sky-100 text-sky-800' : m.status === 'delivered' ? 'bg-brand-100 text-brand-800' : m.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{m.provider ? `provider · ${m.status}` : `mock · ${m.status}`}</span>
                  </div>
                  <div className="mt-1 break-all text-sm text-slate-500">{m.body}</div>
                  <div className="mt-1 flex items-center justify-between text-sm text-slate-400">
                    <span>{m.updated_at}</span>
                    <button className="font-medium text-brand-700 underline" onClick={() => resend(m.id)}>Resend</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="mb-3 text-lg font-bold text-slate-900">Access log</h3>
            <div className="max-h-72 space-y-1 overflow-y-auto text-sm text-slate-600">
              {detail.access.map((a) => (
                <div key={a.id} className="flex justify-between gap-3 border-b border-slate-50 py-1">
                  <span>{a.actor_type} · {a.action} {a.detail ? `· ${a.detail}` : ''}</span>
                  <span className="whitespace-nowrap text-slate-400">{a.created_at}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
