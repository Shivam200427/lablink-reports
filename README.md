# LabLink - Lab Report Delivery for Company A, Vijayawada

**Live demo:** https://lablink-reports.onrender.com (free tier; sleeps when idle - first load can take ~50s; demo data persists on Render's free Postgres across restarts and deploys)

("LabLink" is a demo brand name chosen for this submission; the client is "Company A" per the brief.)

LabLink lets a small diagnostic lab deliver signed-off reports to patients on their phones:
the LIS uploads a CSV, the pathologist signs off an order, and the patient gets a secure
link by WhatsApp/SMS (mocked). The link expires in 72 hours and asks for an OTP sent to the
registered mobile number before the report opens. Out-of-range results get a plain-language
summary in English, Telugu or Hindi. Critical values are never summarised - they create a
callback task for the front desk instead. One mobile number can cover a whole family,
but holding that phone never opens reports on its own: access comes only from explicit
grants - OTP-verified self-registration, a front-desk contact attestation, or a
per-patient delegation to a relative - every grant and revoke audit-logged.

## Stack

- Node.js 22 + Express; SQLite locally, Postgres when `DATABASE_URL` is set (one async data layer)
- React 19 + Vite + Tailwind CSS 3 (mobile-first, large text, low-end phone friendly)
- pdfkit for report PDFs, vitest for tests
- Messaging defaults to a mocked `outbox` table - no paid services needed. An optional
  Fast2SMS Quick SMS sender exists for demos: set `FAST2SMS_API_KEY`,
  `FAST2SMS_ALLOWED_RECIPIENT` (10-digit Indian mobile; only this number can ever
  receive a real SMS), and `FAST2SMS_TOTAL_BUDGET` (default 0 = never send; each
  send claims one slot atomically (single-row, row-locked UPDATE) before the
  provider call and the slot is never released, even on failure). Provider
  failures still record a mocked outbox copy so the demo never stalls; real
  sends report provider acceptance, never delivery. Note: Fast2SMS unlocks
  its API route only after one paid transaction of Rs 100 or more - the free
  signup coupon does not qualify (the API rejects pre-billing with exactly
  that message). The staff console labels every message "mock" (simulated,
  never left the box) or "provider" (really attempted), so a simulated
  delivery is never mistaken for a real one.
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
npm test     # 50 integration tests: flag rules, summary safety, OTP/consent/family,
             # grant-based access (attestation, merges, delegation, revocation),
             # per-test locked templates, sign-off
             # pipeline, secure links, staff console, CSV import, sms guard,
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
