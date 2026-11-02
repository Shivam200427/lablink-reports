# LabLink - Technical Design Document

**GitHub:** https://github.com/Shivam200427/lablink-reports (public; full source + commit history)
**Live app:** not deployed publicly (submission constraint: no paid services; runs locally - see deployment.md for one-command setup and free-tier steps)

**Product:** secure lab-report delivery for City Diagnostics ("Company A"), Vijayawada
**Author:** Shivam Jain - **Date:** 2 November 2026 - **Stack:** Node.js 22 / Express / SQLite - React 19 / Vite / Tailwind

---

## 1. Problem

City Diagnostics finishes tests in its LIS, but reports reach patients late: patients travel
back to the lab to collect paper, call the front desk for values, or wait for a WhatsApp
forward of a photo. The lab wants reports to reach patients on their phones the moment the
pathologist signs off - securely, in language they understand, without the front desk
becoming a bottleneck.

## 2. Users and roles

| Role | Who | What they do in LabLink |
| --- | --- | --- |
| Patient | Often a family member on a shared phone; low-end Android, Telugu/Hindi first | Opens secure link, verifies OTP, views report + plain-language summary, downloads PDF, flags a wrong summary |
| Front-desk staff | Lab reception | Resends links, works the critical-value callback queue, reviews flagged summaries, watches the outbox |
| Pathologist | Lab doctor | Imports the LIS CSV, reviews values, signs off an order (triggers delivery) |
| Referring doctor (optional depth) | Treating physician | OTP login, sees their referred patients' released reports |
| Lab owner / ops (optional depth) | Owner | Delivery and turnaround stats |

## 3. Scope

**In scope (core build):** LIS CSV import; automatic secure report link on sign-off; patient
OTP portal with report view; plain-language summaries of out-of-range values (English,
Telugu, Hindi); front-desk resend; critical-value callback tasks; patient summary flagging;
72-hour link expiry; DPDP consent and access logs; family numbers (one mobile, many patients).

**Optional depth built anyway:** doctor view; ops report.

**Out of scope:** real SMS/WhatsApp sending (mocked outbox - no paid services), payments,
appointment booking, EMR integration beyond CSV.

## 4. Architecture

Single-process monolith, deliberately boring so a small lab can run it anywhere:

```
LIS CSV -> Express API -> SQLite (13 tables)
                |
                +─ sign-off -> 72h secure link + WhatsApp/SMS (mocked outbox)
                |            + template summaries (en/te/hi)
                |            + critical-value callback tasks
                |
React SPA <─────┘  (patient portal / staff console / doctor view / ops)
PDF reports: pdfkit, generated at sign-off and on demand
```

- **Backend:** Express, better-sqlite3 (synchronous, transactional), pdfkit.
- **Frontend:** React 19 + Vite + Tailwind, mobile-first, large tap targets and large text,
  language switcher persisted per patient.
- **Messaging:** `server/outbox.js` writes every WhatsApp/SMS/OTP to an `outbox` table and a
  ticker simulates send/delivered status. Swapping in MSG91/Twilio is a one-file change.
- **Tests:** vitest integration suite (`tests/api.test.js`, 14 tests) boots the real app on
  a throwaway database.

## 5. Core flow

1. **Import:** pathologist uploads the LIS CSV (`sample-data/lis-export.csv`). Rows are
   grouped by Order ID; patients are matched/created by mobile number, so a family sharing
   one phone number lands under one login.
2. **Sign-off:** the pathologist reviews values and signs. `signOffOrder()` then, in one
   transaction: flips order status, generates the report PDF, creates a **72-hour secure
   link**, queues the WhatsApp/SMS message, generates **plain-language summaries** for every
   out-of-range result in the patient's language, and creates a **callback task** for every
   critical value.
3. **Delivery:** patient taps the link -> sees which report it is -> requests OTP -> OTP goes
   to the registered mobile (mocked) -> report opens.
4. **After:** patient reads values + summaries, downloads the PDF, and can flag any summary
   as wrong. Front desk sees flagged summaries and the critical-callback queue, and can
   resend the link (new link, new 72-hour window) when a patient calls.

## 6. Security design

| Mechanism | Design |
| --- | --- |
| Report links | 128-bit random token; only the **SHA-256 hash** is stored. Expires **72 hours** after sign-off. Opening a link requires an OTP to the registered mobile - the link alone is never enough. |
| OTP | 6 digits, 10-minute validity, SHA-256 hashed at rest, single-use (consumed on success), max **5 attempts** per code, and **3 requests per 10 minutes per mobile** to stop brute force and spam. |
| Sessions | Random bearer tokens, hashed at rest, 12-hour expiry, scoped (a link-verified session can only read that one order). |
| Family numbers | One mobile maps to many patients; after OTP the user picks "whose reports". A patient session sees only patients on that number. |
| Consent (DPDP) | First login shows a consent notice (data used only to deliver lab reports, contact the lab to delete); acceptance is recorded with timestamp before any data is shown. |
| Access log | Every report view, OTP event, resend, flag and sign-off writes an `access_log` row (actor, action, subject, time) - the lab can show who saw what, when. |
| Critical values | Never summarised, and the message for a critical report tells the patient the lab will call. A callback task is created so no critical result is silently delivered. |
| Secrets in repo | None. Synthetic demo data only; staff passwords are scrypt-hashed; salt is an env var. |

## 7. AI summary engine (and its safety rules)

Out-of-range values get a plain-language sentence written by an AI model
(`server/ai.js`), wrapped in strict guardrails; a locked template is the safe
floor underneath it.

**Provider configuration (honest):** any OpenAI-compatible chat API works.
`AI_API_KEY` enables it; `AI_BASE_URL` (default api.openai.com) and `AI_MODEL`
(default gpt-4o-mini) select the provider. With no key set - as in this free
demo - the locked templates serve every summary and the record is marked
`engine=template`. Nothing is faked: each summary row stores whether it came
from `ai`, `ai+template` (partial fallback) or `template`.

**Safety rules, enforced in code and tested:**

1. **Critical value -> never sent to the AI, never summarised.** The result
   renders with its critical flag and a callback task is created for the front
   desk.
2. **Unknown analyte / no KB entry -> no summary.** The engine stays silent
   rather than guess.
3. **Locked prompt:** the AI is instructed to write one short sentence saying
   only that the test is above/below the normal range, quoting the exact value
   and range, in the patient's language (en/te/hi) - no advice, no diagnosis,
   no treatment.
4. **Every AI output is validated** before it is stored (`validateAISummary`):
   it must quote the exact result value, stay under 280 chars, and contain no
   advice/medication/diet/treatment/diagnosis wording. Failure - or any
   provider error - falls back to the locked template for that language.
5. **Summaries are short by design** for elderly readers on small phones, and
   the "simple explanation, not medical advice" disclaimer appears once per
   report, not inside every summary.
6. **Patient can flag a summary as wrong.** Flags land in the staff console;
   staff review and resolve. The event is access-logged.

## 8. Data model (SQLite)

`patients` - `staff` - `doctors` - `orders` - `results` - `report_links` (hash, expiry) -
`otps` (hash, attempts, expiry) - `sessions` (hash, scope, expiry) - `outbox` (mocked
WhatsApp/SMS) - `access_log` - `summaries` (analyte, language, text, order) -
`summary_flags` (patient flag + staff review status) - `callback_tasks` (critical value,
patient, status).

## 9. API surface (selected)

- Patient: `POST /api/auth/patient/request-otp`, `POST /api/auth/patient/verify`,
  `GET /api/patient/orders`, `GET /api/patient/orders/:id` (+ `/pdf`),
  `POST /api/patient/summaries/:id/flag`, `POST /api/patient/language`
- Secure link: `GET /api/link/:token`, `POST /api/link/:token/request-otp`,
  `POST /api/link/:token/verify`, `GET /api/link/:token/report`
- Staff: `POST /api/auth/staff/login`, `POST /api/staff/import`,
  `POST /api/staff/orders/:id/signoff`, `POST /api/staff/orders/:id/resend-link`,
  `GET /api/staff/tasks`, `POST /api/staff/tasks/:id/done`,
  `POST /api/staff/summary-flags/:id/review`, `GET /api/staff/outbox`,
  `GET /api/staff/access-log`, `GET /api/staff/ops-report`
- Doctor: `POST /api/auth/doctor/request-otp` (+ verify), `GET /api/doctor/reports`

## 10. Screens

1. Patient login (mobile + OTP) with DPDP consent on first use
2. Family picker ("whose reports?") when one number covers several patients
3. Patient report list
4. Report view: values with high/low flags, plain-language summaries, PDF download, flag-a-summary
5. Secure-link landing + OTP (the 72-hour link path)
6. Staff login
7. Staff console: callback tasks, flagged summaries, patient search + resend, message outbox, access log
8. Pathologist import + sign-off
9. (depth) Doctor report list - 10. (depth) Ops report

## 11. Testing

`npm test` -> 14 vitest integration tests against the real app on a temp database, covering:
flag rules (normal/high/low/critical), summary-engine safety (critical suppressed, unknown
suppressed, disclaimer present, three languages), patient OTP login + consent + family
scoping, the full sign-off pipeline (link + message + summaries + callback task), secure
link flow (expiry, OTP gate, wrong OTP attempts), staff console (resend, task completion,
flag review), and CSV import edge cases.

## 12. Trade-offs, assumptions and honest limitations

**Assumptions the lab must review before any real use:**

- **Sample critical thresholds:** the critical limits in `server/kb.js` (e.g.
  potassium, haemoglobin) are SAMPLE values chosen to exercise the critical
  flow. They are NOT clinically approved - the pathologist must review and set
  every threshold.
- **Reference ranges come from the LIS CSV**, not from this app.
- **Demo logins and all patient data are synthetic.**
- **Stack choice** (Node/Express/SQLite/React) was made for simplicity and
  zero-cost hosting; any equivalent stack would fit the brief.

**Limitations:**

- **SQLite, not Postgres:** right for one branch and a demo; a multi-branch
  deployment should move to Postgres (better-sqlite3 calls are isolated in
  `server/db.js`).
- **Mocked messaging:** no real SMS/WhatsApp leaves the box (submission budget:
  no paid services). The outbox proves the full pipeline; a provider plugs into
  `server/outbox.js`. OTPs are read from the server log/outbox in the demo.
- **AI needs a provider key in production:** without `AI_API_KEY` the locked
  templates carry the summaries (fully tested); with a key, the AI path plus
  validation takes over. No provider was paid for this submission.
- **India data residency:** the demo host options in deployment.md are free
  tiers outside India. A real deployment for Indian patient data should use an
  India-region host (e.g. AWS Mumbai / Azure Central India); this submission
  does not claim DPDP residency compliance.
- **PDFs are functional, not branded** like the lab's printed letterhead.

## 13. If we had more time

Real WhatsApp Business API with delivery receipts; Postgres + multi-branch; audit export for
the lab owner; push the callback task to the doctor too; ABHA/ABDM health-record linking.
