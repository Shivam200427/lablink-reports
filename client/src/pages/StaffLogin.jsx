import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { BrandHeader } from '../App.jsx';

export function StaffNav() {
  return (
    <nav className="mb-5 flex flex-wrap gap-2 text-base">
      {[['Console', '/staff/console'], ['New order', '/staff/new-order'], ['Import & sign-off', '/staff/import'], ['Tasks', '/staff/tasks'], ['Messages', '/staff/messages'], ['Summary sample', '/staff/sample'], ['Ops report', '/staff/ops']].map(([l, p]) => (
        <a key={p} href={p} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-brand-600">{l}</a>
      ))}
    </nav>
  );
}

export default function StaffLogin() {
  const nav = useNavigate();
  const [u, setU] = React.useState('');
  const [p, setP] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function login(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api('/api/auth/staff/login', { method: 'POST', body: { username: u, password: p } });
    setBusy(false);
    if (!r.ok) return setErr('Invalid username or password');
    nav('/staff/console');
  }
  return (
    <div>
      <BrandHeader />
      <form className="card mt-10" onSubmit={login}>
        <h1 className="mb-5 text-2xl font-bold text-slate-900">Staff sign in</h1>
        <label className="label">Username</label>
        <input className="input mb-4" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
        <label className="label">Password</label>
        <input className="input mb-5" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        {err && <p className="mb-3 text-base text-red-600">{err}</p>}
        <button className="btn w-full" disabled={busy || !u || !p}>Sign in</button>
      </form>
    </div>
  );
}
