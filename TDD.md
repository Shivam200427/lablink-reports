# LabLink - Technical Design Document

**GitHub:** https://github.com/Shivam200427/lablink-reports (public; full source + commit history)
**Live app:** https://lablink-reports.onrender.com (free Render demo, Singapore region; sleeps when idle so the first load can take ~50s; demo data resets to seed on restart. No paid services used.)

**Product:** secure lab-report delivery for Company A, Vijayawada ("LabLink" is a demo brand name chosen for this submission)
**Author:** Shivam Jain, built with AI assistance (the brief encourages AI) - **Date:** 2 November 2026 - **Stack:** Node.js 22 / Express / SQLite - React 19 / Vite / Tailwind

---

## 1. Problem

Company A finishes tests in its LIS, but reports reach patients late: patients travel
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
LIS CSV -> Express API -> SQLite (14 tables)
                |
                +─ sign-off -> 72h secure link + WhatsApp/SMS (mocked outbox)
                |            + plain-language summaries en/te/hi (AI or locked template)
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
- **Tests:** 24 vitest integration tests (`tests/`: api, security, resilience) boot the
  real app on a throwaway database.

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

Out-of-range values get a plain-language sentence (`server/ai.js`): written by
an AI model when a provider is configured, and by the locked template otherwise.
The template is always the safe floor underneath the AI.

**Provider configuration (honest):** any OpenAI-compatible chat API works, in
either of two ways: `AI_API_KEY` for a paid/production provider, or
`AI_BASE_URL` pointing at a keyless OpenAI-compatible endpoint (`AI_MODEL`
selects the model, default gpt-4o-mini). With neither set, the locked templates
serve every summary and rows are marked `engine=template`. Nothing is faked:
each summary row stores whether it came from `ai`, `ai+template` (partial
fallback) or `template`.

**Live configuration (this demo, honest state):** the deployed app is
configured with `AI_BASE_URL=https://text.pollinations.ai/openai`,
`AI_MODEL=openai-fast` - a free keyless endpoint, no paid key. The AI code
path is real and was proven end-to-end from the app's own code (a real
validated AI sentence stored as `engine=ai+template`). On the free demo host,
provider calls did not succeed at verification time, so every live summary
served from the locked templates - the safety floor working exactly as
designed, and labelled honestly: every summary row stores `engine=ai`,
`ai+template` or `template`, visible on the staff Summary-sample page.
Generation is sequential with spacing; fallback under throttling or provider
failure is by design. A production deployment should use a paid, compliant
provider (`AI_API_KEY`) - none was paid for this submission.

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
7. **Template floor, stated honestly:** the knowledge base name-matches 31 common
   analytes (`server/kb.js`, with SAMPLE critical thresholds), but the locked
   template is one generic direction sentence per language ("your X is
   below/above the normal range", with the value and range filled in) - not 30
   test-specific, clinically worded explanations. The brief's "locked templates
   for the 30 most common tests" is therefore met only as a safe generic floor:
   the meaningful per-test explanation is expected from the AI, and per-test
   template copy needs a pathologist's authorship before real use. Honestly stated: this is ONE fixed sentence pattern per
   direction (below/above), rendered in en/te/hi with the analyte's own name,
   value and reference range - fixed wording, nothing generated - applied to
   all 31 analytes, not 31 distinct hand-written texts. Analytes outside the
   KB get no summary by design.
8. **Pathologist weekly quality review:** `GET /api/staff/summary-sample`
   returns up to **50 random summaries from the last 7 days**; the pathologist
   records an `ok` / `needs_fix` verdict per summary (stored in
   `summary_reviews`) from the staff console's "Weekly AI review" page. This
   implements the brief's "a pathologist reviews 50 summaries a week".

## 8. Data model (SQLite)

`patients` - `staff` - `doctors` - `orders` - `results` - `report_links` (hash, expiry) -
`otps` (hash, attempts, expiry) - `sessions` (hash, scope, expiry) - `outbox` (mocked
WhatsApp/SMS) - `access_log` - `summaries` (analyte, language, text, order) -
`summary_flags` (patient flag + staff review status) - `summary_reviews`
(pathologist weekly-sample verdicts) - `callback_tasks` (critical value,
patient, status).

## 9. API surface (selected)

- Patient: `POST /api/auth/patient/request-otp`, `POST /api/auth/patient/verify`,
  `GET /api/patient/orders`, `GET /api/patient/orders/:id` (+ `/pdf`),
  `POST /api/patient/summaries/:id/flag`, `POST /api/patient/language`
- Secure link: `GET /api/link/:token`, `POST /api/link/:token/request-otp`,
  `POST /api/link/:token/verify`, `GET /api/link/:token/report`,
  `GET /api/link/:token/pdf`
- Staff: `POST /api/auth/staff/login`, `POST /api/staff/import`,
  `GET /api/staff/orders?status=` (orders with public codes for the sign-off list),
  `POST /api/staff/orders/:id/signoff`, `POST /api/staff/orders/:id/resend-link`,
  `GET /api/staff/tasks`, `POST /api/staff/tasks/:id/done`,
  `POST /api/staff/summary-flags/:id/review`, `GET /api/staff/outbox`,
  `GET /api/staff/access-log`, `GET /api/staff/ops-report`,
  `GET /api/staff/summary-sample`, `POST /api/staff/summary-sample/:id/review`
- Doctor: `POST /api/auth/doctor/request-otp` (+ verify), `GET /api/doctor/reports`

## 10. Screens

1. Patient login (mobile + OTP) with DPDP consent on first use
2. Family picker ("whose reports?") when one number covers several patients
3. Patient report list
4. Report view: values with high/low flags, plain-language summaries, PDF download, flag-a-summary
5. Secure-link landing + OTP (the 72-hour link path)
6. Staff login
7. Staff console: patient search + resend
8. Staff message outbox: every mocked WhatsApp/SMS/OTP with delivery status, filterable by mobile and kind
9. Staff tasks (critical callbacks + flagged summaries), weekly AI-summary review
10. Pathologist import + sign-off: processing orders listed by public order code (ORD-xxxxx) with flag status - no internal ids
11. (depth) Doctor report list - 12. (depth) Ops report

**Ops metric definitions:** the report counts only `report_ready` notifications (the WhatsApp/SMS carrying the report link). *Links sent* reconciles exactly: `links_sent = delivered + failed + in_flight` (asserted by test). OTP messages are counted separately so the two populations never mix. Report views and PDF downloads come from `access_log`.

## 11. Reliability notes

- Sign-off can never be stalled by a sick AI provider: every provider call has a hard 10s timeout (AI_TIMEOUT_MS), generation stops attempting AI after a 25s per-order budget (AI_ORDER_BUDGET_MS), and the locked template is always the floor.
- Deploy startup is deterministic: the seed never touches the network and only seeds an EMPTY database, so a service restart does not wipe data while the instance filesystem survives (free-tier recycles still start empty - see Limitations).
- Provider errors are logged (test name + error only, no patient data) so template fallbacks are diagnosable in host logs.

## 12. Testing

`npm test` -> **24 vitest integration tests** against the real app on a temp database:

- `tests/api.test.js` (14): flag rules (normal/high/low/critical), summary-engine
  safety (critical suppressed, unknown suppressed, disclaimer present, three
  languages), patient OTP login + consent + family scoping, the full sign-off
  pipeline (link + message + summaries + callback task), secure link flow
  (expiry, OTP gate, wrong OTP attempts), staff console (resend, task
  completion, flag review), CSV import edge cases.
- `tests/resilience.test.js` (3) - a hanging provider still falls back fast, a silent server hits the hard timeout, and the seed skips a populated database.
- `tests/security.test.js` (7) - the security review, executable:
  role isolation (401 with no session, 403 with the wrong role); IDOR - a
  patient session cannot read another mobile's order, and a link-verified
  session is scoped to exactly one order (patient portal and other links
  reject it); OTP brute-force lockout (5 attempts) and request rate limiting;
  unknown link tokens return 404 with no data; an **expired** link returns 410,
  cannot request or verify an OTP, and its report/PDF stay closed even with a
  previously verified session; sign-off is idempotent; unauthorized PDF
  download is rejected; the weekly sample returns at most 50 rows and records
  reviews.

## 13. Trade-offs, assumptions and honest limitations

**Assumptions the lab must review before any real use:**

- **Family number means household access:** the OTP verifies possession of the
  family phone, **not the individual patient**. Anyone holding that phone
  during the OTP window can open every patient registered to that number.
  This means the brief's "no report opened by the wrong person" success
  criterion is NOT fully met inside a household - that is a residual risk and
  an unresolved client decision, not a criterion this build claims to satisfy.
  Mitigations in place: per-report OTP on secure links, 72-hour link expiry,
  and a full access log. A stricter option (per-patient registered numbers) is
  a product decision the lab must own.
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
- **AI provider:** the demo runs free on locked templates by default and was
  also proven against a keyless free endpoint (`AI_BASE_URL`) with a real,
  validated AI sentence stored; under the free endpoint's throttling the
  fallback took over, by design. Production should use a paid, compliant
  provider via `AI_API_KEY` - no provider was paid for this submission.
- **India data residency:** the demo host options in deployment.md are free
  tiers outside India. A real deployment for Indian patient data should use an
  India-region host (e.g. AWS Mumbai / Azure Central India); this submission
  does not claim DPDP residency compliance.
- **PDFs are functional, not branded** like the lab's printed letterhead.

## 14. If we had more time

Real WhatsApp Business API with delivery receipts; Postgres + multi-branch; audit export for
the lab owner; push the callback task to the doctor too; ABHA/ABDM health-record linking.
