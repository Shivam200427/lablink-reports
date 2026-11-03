import React from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import PatientLogin from './pages/PatientLogin.jsx';
import PatientRegister from './pages/PatientRegister.jsx';
import PatientHome from './pages/PatientHome.jsx';
import ReportView from './pages/ReportView.jsx';
import LinkGate from './pages/LinkGate.jsx';
import StaffLogin from './pages/StaffLogin.jsx';
import StaffForbidden from './pages/StaffForbidden.jsx';
import StaffConsole from './pages/StaffConsole.jsx';
import StaffImport from './pages/StaffImport.jsx';
import StaffNewOrder from './pages/StaffNewOrder.jsx';
import StaffTasks from './pages/StaffTasks.jsx';
import StaffSample from './pages/StaffSample.jsx';
import OpsReport from './pages/OpsReport.jsx';
import StaffOutbox from './pages/StaffOutbox.jsx';
import DoctorLogin from './pages/DoctorLogin.jsx';
import DoctorReports from './pages/DoctorReports.jsx';

export const LangCtx = React.createContext({ lang: 'en', setLang: () => {} });

export function LangPicker({ lang, setLang }) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef(null), trigger = React.useRef(null), first = React.useRef(null);
  const id = React.useId();
  const choices = [['en', 'English'], ['te', 'తెలుగు'], ['hi', 'हिंदी']];
  const close = () => { setOpen(false); trigger.current?.focus(); };
  React.useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const escape = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-label="Change language" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(!open)} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg>
      <span>{choices.find(([k]) => k === lang)?.[1] || 'English'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div id={id} role="group" aria-label="Choose language" className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
      {choices.map(([k,label],i) => <button ref={i === 0 ? first : undefined} key={k} type="button" lang={k} aria-pressed={lang === k}
        onClick={() => { setLang(k); close(); }} className={`flex min-h-12 w-full items-center justify-between rounded-lg px-4 py-3 text-left text-base font-semibold ${lang === k ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
        <span>{label}</span>{lang === k && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}

export function BrandHeader({ right }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white">L</span>
        <span className="text-xl font-bold tracking-tight text-slate-900">LabLink</span>
        <span className="hidden text-sm text-slate-400 sm:inline">Company A Diagnostics</span>
      </Link>
      {right}
    </header>
  );
}

export default function App() {
  const [lang, setLang] = React.useState(localStorage.getItem('ll_lang') || 'en');
  const set = (l) => { setLang(l); localStorage.setItem('ll_lang', l); };
  return (
    <LangCtx.Provider value={{ lang, setLang: set }}>
      <div className="mx-auto min-h-screen max-w-2xl px-4 py-6">
        <Routes>
          <Route path="/" element={<PatientLogin />} />
          <Route path="/register" element={<PatientRegister />} />
          <Route path="/home" element={<PatientHome />} />
          <Route path="/orders/:id" element={<ReportView />} />
          <Route path="/r/:token" element={<LinkGate />} />
          <Route path="/staff" element={<StaffLogin />} />
          <Route path="/staff/forbidden" element={<StaffForbidden />} />
          <Route path="/staff/console" element={<StaffConsole />} />
          <Route path="/staff/import" element={<StaffImport />} />
          <Route path="/staff/new-order" element={<StaffNewOrder />} />
          <Route path="/staff/tasks" element={<StaffTasks />} />
          <Route path="/staff/sample" element={<StaffSample />} />
          <Route path="/staff/ops" element={<OpsReport />} />
          <Route path="/staff/messages" element={<StaffOutbox />} />
          <Route path="/doctor" element={<DoctorLogin />} />
          <Route path="/doctor/reports" element={<DoctorReports />} />
        </Routes>
      </div>
    </LangCtx.Provider>
  );
}
