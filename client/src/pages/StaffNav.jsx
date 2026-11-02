import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';

let mePromise = null;
export function staffMe() {
  if (!mePromise) mePromise = api('/api/staff/me').then((r) => (r.ok ? r.data : null));
  return mePromise;
}
export function resetStaffMe() { mePromise = null; }

const ROLE_LABEL = { frontdesk: 'Front desk', pathologist: 'Pathologist', ops: 'Operations' };

const GROUPS = [
  { label: 'Patients & orders', items: [
    ['Find a patient', '/staff/console'],
    ['New walk-in order', '/staff/new-order'],
    ['Import & sign-off', '/staff/import'],
    ['Tasks & callbacks', '/staff/tasks'],
  ]},
  { label: 'Messages & review', items: [
    ['Messages', '/staff/messages'],
    ['Weekly AI review', '/staff/sample'],
  ]},
  { label: 'Insights', items: [
    ['Ops report', '/staff/ops'],
  ]},
];

export default function StaffNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const [me, setMe] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { staffMe().then(setMe); }, []);
  React.useEffect(() => { setOpen(false); }, [loc.pathname]);

  async function signOut() {
    await api('/api/auth/staff/logout', { method: 'POST' });
    resetStaffMe();
    nav('/staff');
  }

  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="min-w-0 truncate text-sm text-slate-500">
        {me ? <>{me.full_name}<span className="hidden min-[420px]:inline"> · <span className="font-medium text-slate-700">{ROLE_LABEL[me.role] || me.role}</span></span></> : null}
      </div>
      <div className="relative">
        <button
          aria-label="Staff menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-brand-600"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              {GROUPS.map((g) => (
                <div key={g.label} className="mb-1">
                  <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
                  {g.items.map(([l, p]) => (
                    <a
                      key={p}
                      href={p}
                      className={`block rounded-lg px-3 py-2.5 text-base font-medium ${loc.pathname === p ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >{l}</a>
                  ))}
                </div>
              ))}
              <div className="mt-1 border-t border-slate-100 pt-1">
                <button onClick={signOut} className="block w-full rounded-lg px-3 py-2.5 text-left text-base font-medium text-red-600 hover:bg-red-50">Sign out</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
