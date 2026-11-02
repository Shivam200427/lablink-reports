import React from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import PatientLogin from './pages/PatientLogin.jsx';
import PatientRegister from './pages/PatientRegister.jsx';
import PatientHome from './pages/PatientHome.jsx';
import ReportView from './pages/ReportView.jsx';
import LinkGate from './pages/LinkGate.jsx';
import StaffLogin from './pages/StaffLogin.jsx';
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
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm font-medium">
      {[['en', 'EN'], ['te', 'తెలుగు'], ['hi', 'हिंदी']].map(([k, label]) => (
        <button key={k} onClick={() => setLang(k)}
          className={`rounded-lg px-3 py-1.5 ${lang === k ? 'bg-brand-700 text-white' : 'text-slate-600'}`}>{label}</button>
      ))}
    </div>
  );
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
