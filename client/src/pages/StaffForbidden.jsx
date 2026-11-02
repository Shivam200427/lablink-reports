import React from 'react';
import { BrandHeader } from '../App.jsx';

export default function StaffForbidden() {
  return (
    <div>
      <BrandHeader />
      <div className="card mt-10 text-center">
        <h2 className="mb-2 text-xl font-semibold text-slate-800">No access to this page</h2>
        <p className="mb-5 text-base text-slate-600">
          You are still signed in, but this account does not have permission for that page.
        </p>
        <a href="/staff/console" className="btn inline-block">Back to console</a>
      </div>
    </div>
  );
}
