# LabLink - Lab Report Delivery for City Diagnostics, Vijayawada

LabLink lets a small diagnostic lab deliver signed-off reports to patients on their phones:
the LIS uploads a CSV, the pathologist signs off an order, and the patient gets a secure
link by WhatsApp/SMS (mocked). The link expires in 72 hours and asks for an OTP sent to the
registered mobile number before the report opens. Out-of-range results get a plain-language
summary in English, Telugu or Hindi. Critical values are never summarised - they create a
callback task for the front desk instead. One mobile number can cover a whole family.

## Stack

- Node.js 22 + Express, better-sqlite3 (single-file database, no external services)
- React 19 + Vite + Tailwind CSS 3 (mobile-first, large text, low-end phone friendly)
- pdfkit for report PDFs, vitest for tests
- All messaging (WhatsApp/SMS/OTP) is mocked into an `outbox` table - no paid services

## Quick start

```bash
npm install
npm run seed     # creates data/lablink.db with synthetic patients, orders, staff, doctors
npm run build    # builds the React client into client/dist
npm start        # serves API + client on http://localhost:3000
```

For development with hot reload: `npm run dev` (API on :3000) plus `npm run dev:client` (Vite on :5173).

## Demo logins (all synthetic)

| Role | Login |
| --- | --- |
| Patient | mobile `9000000001` (Lakshmi's family) or `9000000004` (Srinivas & Padma) - OTP appears in the server log and the `outbox` table |
| Front desk | username `frontdesk`, password `Lab@2026` |
| Doctor | mobile `9000000020` (Dr. P. Anitha) - OTP login |
| Lab owner / ops | username `ops`, password `Ops@2026` |
| Pathologist (sign-off) | username `patho`, password `Patho@2026` |

To try the LIS import: sign in as `patho`, open the Import screen and upload `sample-data/lis-export.csv`,
then sign off the new orders and watch the outbox (staff console > Messages).

## Tests

```bash
npm test     # 12 integration tests: flag rules, summary safety, OTP/consent/family,
             # sign-off pipeline, secure links, staff console, CSV import
```

## Layout

```
server/    Express API, SQLite schema, OTP/link security, summary engine, PDF, LIS import
client/    React SPA (patient portal, staff console, doctor view, ops report)
tests/     vitest integration tests
sample-data/  example LIS CSV export
```

See `deployment.md` for deployment steps and `TDD.md` for the full design document.
