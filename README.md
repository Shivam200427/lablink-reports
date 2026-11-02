# LabLink - Lab Report Delivery for Company A, Vijayawada

**Live demo:** https://lablink-reports.onrender.com (free tier; sleeps when idle - first load can take ~50s; data resets to seed on restart)

("LabLink" is a demo brand name chosen for this submission; the client is "Company A" per the brief.)

LabLink lets a small diagnostic lab deliver signed-off reports to patients on their phones:
the LIS uploads a CSV, the pathologist signs off an order, and the patient gets a secure
link by WhatsApp/SMS (mocked). The link expires in 72 hours and asks for an OTP sent to the
registered mobile number before the report opens. Out-of-range results get a plain-language
summary in English, Telugu or Hindi. Critical values are never summarised - they create a
callback task for the front desk instead. One mobile number can cover a whole family.

## Stack

- Node.js 22 + Express; SQLite locally, Postgres when `DATABASE_URL` is set (one async data layer)
- React 19 + Vite + Tailwind CSS 3 (mobile-first, large text, low-end phone friendly)
- pdfkit for report PDFs, vitest for tests
- All messaging (WhatsApp/SMS/OTP) is mocked into an `outbox` table - no paid services
- Plain-language summaries use an AI provider when configured (`AI_API_KEY`, or a
  keyless `AI_BASE_URL` endpoint); every AI sentence is validated and falls back
  to locked templates when it throttles or fails validation. The live demo runs
  on a free keyless endpoint; with no AI env vars it serves templates only

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
| Patient | mobile `9000000001` (Lakshmi's family) or `9000000004` (Srinivas & Padma) - OTP appears in the staff console (front desk > search the mobile > Messages) and the `outbox` table |
| Front desk | username `frontdesk`, password `Lab@2026` |
| Doctor | mobile `9100000002` (Dr. P. Anitha) - OTP login |
| Lab owner / ops | username `ops`, password `Ops@2026` |
| Pathologist (sign-off) | username `patho`, password `Patho@2026` |

To try the LIS import: sign in as `patho`, open the Import screen and upload `sample-data/lis-export.csv`,
then sign off the new orders and watch the outbox (staff console > Messages).

## Tests

```bash
npm test     # 21 integration tests: flag rules, summary safety, OTP/consent/family,
             # sign-off pipeline, secure links, staff console, CSV import,
             # + security suite (roles, IDOR, OTP lockout, link expiry, PDF access)
```

## Layout

```
server/    Express API, SQLite schema, OTP/link security, summary engine, PDF, LIS import
client/    React SPA (patient portal, staff console, doctor view, ops report)
tests/     vitest integration tests
sample-data/  example LIS CSV export
```

See `deployment.md` for deployment steps and `TDD.md` for the full design document.

## Provenance

Built by Shivam Jain with AI assistance (design, code and docs drafted with an AI
pair-programmer and reviewed/edited by the author), as encouraged by the brief.
