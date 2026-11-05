# LabLink - Technical Design Document

**GitHub:** https://github.com/Shivam200427/lablink-reports (public; full source and commit history)
**Live app:** https://lablink-reports.getvoroa.com (Voroa app and PostgreSQL in Mumbai; synthetic demo). Parallel Render fallback: https://lablink-reports.onrender.com (Singapore). Both stay live. See deployment.md for the current configuration and free-host limits; there is no production compliance or uptime guarantee.

**Product:** secure lab-report delivery for Company A, Vijayawada ("LabLink" is a demo brand name chosen for this submission)
**Author:** shivam jain - **Date:** 5 November 2026 - **Stack:** Node.js 22 / Express / SQLite locally, Postgres on the demo host - React 19 / Vite / Tailwind

---

## 1. Problem

Company A finishes tests in its lab information system (LIS), but reports reach patients late. Patients travel back to the lab to collect paper, call the front desk for values, or wait for a WhatsApp forward of a photo. The lab wants reports to reach patients on their phones the moment the pathologist signs off - securely, in a language they understand, and without the front desk becoming a bottleneck.

## 2. Users and roles

| Role | Who | What they do in LabLink |
| --- | --- | --- |
| Patient | Often a family member on a shared phone; low-end Android, Telugu/Hindi first | Opens the secure link, verifies the OTP, views the report and plain-language summary, downloads the PDF, flags a wrong summary |
| Front-desk staff | Lab reception | Resends links, works the critical-value callback queue, reviews flagged summaries, watches the outbox |
| Pathologist | Lab doctor | Imports the LIS CSV, reviews values, signs off an order (this triggers delivery) |
| Referring doctor (optional depth) | Treating physician | Logs in by OTP and sees their referred patients' released reports |
| Lab owner / ops (optional depth) | Owner | Sees delivery and turnaround statistics |

Role checks run on the server, not just in the UI. Only a pathologist can import, sign off or open the weekly AI review. Only the front desk can enter walk-in orders. Only the ops head can open the ops report. Anyone else gets a `403`, which keeps the session and shows an explanation screen; only an expired or missing session (`401`) returns to sign-in.

## 3. Scope

**In scope (core build):** LIS CSV import; automatic secure report link on sign-off; patient self-registration and OTP portal with report view; plain-language summaries of out-of-range values in English, Telugu and Hindi; front-desk resend; critical-value callback tasks; patient summary flagging; 72-hour link expiry; DPDP consent and access logs; family numbers (one mobile, many patients).

**Optional depth built anyway:** doctor view; ops report.

**Out of scope:** real SMS/WhatsApp sending (mocked outbox - no paid services), payments, appointment booking, EMR integration beyond CSV.

## 4. Architecture

A single-process monolith, deliberately boring so a small lab can run it anywhere:

```
LIS CSV -> Express API -> database: SQLite locally, Postgres on the demo host (18 tables)
                |
                +─ sign-off -> 72h secure link + WhatsApp/SMS (mocked outbox)
                |            + plain-language summaries en/te/hi (AI or locked template)
                |            + critical-value callback tasks
                |
React SPA <─────┘  (patient portal / staff console / doctor view / ops)
PDF reports: pdfkit, generated at sign-off and on demand (cached file, regenerated from the database when missing). A4, zebra-striped result table with wrapped-row height safety, bold values and red HIGH/LOW flags, continuation pages repeat the table header and carry patient name + order code, every page footed with the sample-data disclaimer and page numbers.
```

- **Backend:** Express, one async data layer (`server/db.js`) over better-sqlite3 locally and `pg` (Postgres) when `DATABASE_URL` is set, plus pdfkit.
- **Frontend:** React 19 + Vite + Tailwind, mobile-first, with large tap targets and large text. A globe language picker offers English, Telugu and Hindi, saved on the device. Every patient-facing page carries the switcher, and every error state (OTP failure, rate limit, network loss, invalid link) renders in the selected language. A lost connection shows a retry message instead of hanging or bouncing to sign-in. Staff and doctor consoles are English-only.
- **Messaging:** `server/outbox.js` writes every WhatsApp/SMS/OTP to an `outbox` table, and a ticker simulates sent/delivered status. A real provider would need a durable dispatch worker, provider configuration and delivery-receipt handling.
- **Tests:** 78 vitest integration tests (`tests/`: api, security, resilience, sms, liswatch) boot the real app on a throwaway database.

## 5. Core flow

1. **Import.** The pathologist uploads the LIS CSV (`sample-data/lis-export.csv`) or drops it in the watched export folder (`LIS_WATCH_DIR`, polled every 5 seconds; files move to `imported/` or `failed/` with access-log entries). The front desk can also register a walk-in patient directly, with no CSV; the order lands in the same sign-off queue. Rows are grouped by Order ID and attach to **lab-created** records by mobile plus name (or by name only when exactly one lab record matches). An import creates **no access grants**: a lab-created patient cannot log in until the front desk attests their contact number (step 3).
2. **Sign-off.** The pathologist reviews the values and signs. A Ready/signed CSV export releases automatically once every row for that order has loaded. `signOffOrder()` then runs one transaction: it flips the order status, generates the report PDF, creates a **72-hour secure link**, queues the WhatsApp/SMS message, generates **plain-language summaries** for every out-of-range result in the patient's language, and creates a **callback task** for every critical value.
3. **Registration and enrolment.** Access is grant-based: OTP proves phone possession, not identity. Authorization comes only from `patient_access` grant rows, never from the contact mobile on file. There are three grant kinds. **self**: self-registration requires DPDP consent before the name, mobile and language are saved, creates an *empty* record (`created_via=self`), and the first successful OTP verify creates a `self` grant over that empty record only; a lost first OTP can be requested again without creating access. **contact**: a staff member attests the patient's contact number and records the patient's registration consent, either inline at walk-in entry (the form refuses submission without both ticks) or later with "verify contact" in the console (required before any LIS-created patient can log in). **delegated**: the front desk grants a relative's mobile access to one patient, revocable. A LIS import never merges with a self-registered account on its own: an export row whose mobile and name match one attaches to a lab-created record and raises a **pending identity match** (`patient_merges`), and the front desk confirms "same person" (orders move to the account, audit-logged) or "different people". A **name-only** row attaches to lab-created patients only, and only when exactly one matches; an ambiguous name is held with a staff-facing error asking for a Mobile column rather than guessing. A self-asserted name or a held phone alone can never pull in someone else's report.
4. **Delivery.** The patient taps the link, sees which report it is, requests an OTP, and the OTP goes to the registered mobile (mocked). Then the report opens.
5. **After.** The patient reads values and summaries, downloads the PDF, and can flag any summary as wrong. The front desk sees flagged summaries and the critical-callback queue, and can resend the link (a new link with a new 72-hour window) when a patient calls.

## 6. Security design

| Mechanism | Design |
| --- | --- |
| Report links | 128-bit random token; only the **SHA-256 hash** is stored. Expires **72 hours** after sign-off. Opening a link requires an OTP to the registered mobile - the link alone is never enough. |
| OTP | 6 digits, 10-minute validity, SHA-256 hashed at rest, single-use, max **5 attempts** per code, and **3 requests per 10 minutes per mobile** to stop brute force and spam. |
| Sessions | Random bearer tokens, hashed at rest, 12-hour expiry, scoped (a link-verified session can only read that one order). |
| Family numbers | One mobile can serve many patients, but access comes from explicit per-patient grants, never from the number itself. A grant exists only after OTP-verified self-registration, a front-desk contact attestation (walk-in or verify-contact), or a delegated family grant. After OTP, the user picks "whose reports" from only the patients they hold a grant for. Seeded demo families use system-labelled fixture grants, never attributed to a staff member. Revoking a grant immediately closes portal access and any already-open report links (403 access_revoked). |
| Self-registration | OTP proves phone possession, not identity. A self-registered record is empty and marked `created_via=self`. Lab-asserted rows (LIS import or front-desk entry) never attach automatically: a same-mobile-and-name LIS import raises a **pending merge** that staff must attest before anything merges; name-only imports stay separate patients. A mobile already known to the lab cannot self-register (409). Ambiguous name-only rows (two lab patients with the same name) are held with an error, never guessed. |
| Consent (DPDP) | Captured at **registration** on the app's registration paths: self-registration refuses to store details without the patient's DPDP consent, and front-desk walk-in entry refuses submission until staff record both identity/contact verification and the patient's consent. LIS-created records represent registrations already handled by the lab's upstream system (LIS changes are out of scope); LabLink grants them no portal access until staff attest the contact number. Legacy lab-enrolled records without a stored timestamp still see the consent notice at first verified access, before reports. |
| Access log | Every report view, OTP event, resend, flag and sign-off writes an `access_log` row (actor, action, subject, time), so the lab can show who saw what, when. |
| Critical values | Never summarised. The message for a critical report tells the patient the lab will call, and a callback task is created, so no critical result is silently delivered. |
| Secrets in repo | None. Synthetic demo data only; staff passwords are scrypt-hashed; the salt is an env var. |

## 7. AI summary engine (and its safety rules)

Out-of-range values get a plain-language sentence (`server/ai.js`). An AI model writes it when a provider is configured; otherwise a locked template writes it. The template is always the safe floor underneath the AI.

**Provider configuration.** Any OpenAI-compatible chat API works, in one of two ways: `AI_API_KEY` for a paid/production provider, or `AI_BASE_URL` pointing at a keyless OpenAI-compatible endpoint (`AI_MODEL` selects the model, default gpt-4o-mini). With neither set, the locked templates serve every summary and rows are marked `engine=template`. Nothing is faked: each summary row stores whether it came from `ai`, `ai+template` (partial fallback) or `template`.

**Live configuration in this demo.** The app is configured for Google's Gemini free tier through its OpenAI-compatible endpoint (`AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `AI_MODEL=gemini-2.5-flash`, `AI_REASONING_EFFORT=none`; the request cap was raised to 400 output tokens and hidden reasoning disabled after truncated Telugu output was observed at lower caps). The AI code path was proven end-to-end from the app's own code against the real Gemini API, with real validated AI sentences, including Telugu, stored as `engine=ai`. Gemini returned a 503 "high demand" once, and the app fell back to the locked template by design - the safety floor working as intended. Only synthetic demo data is ever sent, and no provider was paid for this submission. The earlier keyless-endpoint configuration (pollinations.ai) was replaced because its calls never succeeded at verification time. Every summary row stores `engine=ai`, `ai+template` or `template`, visible on the staff Summary-sample page.

**Safety rules, enforced in code and tested:**

1. **A critical value is never sent to the AI and never summarised.** The result renders with its critical flag, and a callback task is created for the front desk.
2. **Unknown analyte, or no knowledge-base entry, means no summary.** The engine stays silent rather than guess.
3. **Locked prompt.** The AI is told to write one short sentence saying only that the test is above or below the normal range, quoting the exact value and range, in the patient's language (en/te/hi). No advice, no diagnosis, no treatment.
4. **Every AI output is validated before it is stored** (`validateAISummary`): it must quote the exact result value, stay under 280 characters, and contain no advice, medication, diet, treatment or diagnosis wording. Any failure or provider error falls back to the locked template for that language.
5. **Summaries are short by design** for elderly readers on small phones. The "simple explanation, not medical advice" disclaimer appears once per report, not inside every summary.
6. **The patient can flag a summary as wrong.** Flags land in the staff console, where staff review and resolve them. The event is access-logged.
7. **Per-test locked templates.** `server/templates.js` carries a distinct locked explanation for each of the 31 knowledge-base analytes, for both directions (high and low), in English, Telugu and Hindi. Each is one or two factual, non-diagnostic sentences (what the analyte does, what a high or low value can be seen with), ending with the fixed line that the result alone does not confirm any illness and the patient should discuss it with a doctor. The value and reference range are filled in at render. The wording is grounded in MedlinePlus patient-education pages (docs/template-sources.md, verified per analyte) and is NOT clinically reviewed: before any real use the pathologist must approve every text, and the Telugu/Hindi drafts need a fluent reviewer's pass. Analytes outside the knowledge base get no summary by design.
8. **Pathologist weekly quality review.** `GET /api/staff/summary-sample` returns up to **50 random summaries from the last 7 days**; the pathologist records an `ok` or `needs_fix` verdict per summary (stored in `summary_reviews`) from the staff console's "Weekly AI review" page. This implements the brief's "a pathologist reviews 50 summaries a week".

## 8. Data model (SQLite locally / Postgres on the demo host)

`patients` - `staff` - `doctors` - `orders` - `results` - `report_links` (hash, expiry) - `otps` (hash, attempts, expiry) - `sessions` (hash, scope, expiry) - `outbox` (mocked WhatsApp/SMS) - `access_log` - `summaries` (analyte, language, text, order) - `summary_flags` (patient flag + staff review status) - `summary_reviews` (pathologist weekly-sample verdicts) - `callback_tasks` (critical value, patient, status) - `patient_access` (per-patient grants: who may see which patient, granted via OTP self-registration, staff contact attestation or delegation) - `patient_merges` (pending/rejected identity matches between lab-asserted and self-registered records) - `sms_budget` + `sms_real_claims` (atomic real-SMS spend guard, demo-only).

## 9. API surface (selected)

- Patient: `POST /api/auth/patient/request-otp`, `POST /api/auth/patient/verify`, `GET /api/patient/orders`, `GET /api/patient/orders/:id` (+ `/pdf`), `POST /api/patient/summaries/:id/flag`, `POST /api/patient/language`
- Secure link: `GET /api/link/:token`, `POST /api/link/:token/request-otp`, `POST /api/link/:token/verify`, `GET /api/link/:token/report`, `GET /api/link/:token/pdf`
- Staff: `POST /api/auth/staff/login`, `POST /api/auth/staff/logout`, `POST /api/staff/orders` (walk-in entry, front desk only), `POST /api/staff/import` (pathologist only), `GET /api/staff/orders?status=` (orders with public codes for the sign-off list), `POST /api/staff/orders/:id/signoff` (pathologist only), `POST /api/staff/orders/:id/resend-link`, `GET /api/staff/tasks`, `POST /api/staff/tasks/:id/done`, `POST /api/staff/summary-flags/:id/review`, `GET /api/staff/outbox`, `GET /api/staff/access-log`, `GET /api/staff/ops-report` (ops head only), `GET /api/staff/summary-sample`, `POST /api/staff/summary-sample/:id/review` (pathologist only)
- Doctor: `POST /api/auth/doctor/request-otp` (+ verify), `GET /api/doctor/reports`

## 10. Screens

1. Patient self-registration (name, mobile, language) with DPDP consent before details are saved; OTP verification, linked from login
2. Patient login (mobile + OTP) with DPDP consent on first use
3. Family picker ("whose reports?") when one number covers several patients
4. Patient report list
5. Report view: values with high/low flags, plain-language summaries, PDF download, flag-a-summary
6. Secure-link landing + OTP (the 72-hour link path)
7. Staff login; signed-in staff get a hamburger menu grouped by task (Patients & orders / Messages & review / Insights) showing only the pages their role may use, plus sign-out; a forbidden page explains `403` without ending the session
8. Staff console: patient search + resend
9. Front-desk walk-in order entry (patient + test results, no CSV) with identity/contact and registration-consent attestations
10. Staff message outbox: every mocked WhatsApp/SMS/OTP with delivery status, filterable by mobile and kind
11. Staff tasks (critical callbacks + flagged summaries), weekly AI-summary review
12. Pathologist import + sign-off: processing orders listed by public order code (ORD-xxxxx) with flag status - no internal ids
13. (depth) Doctor report list - 14. (depth) Ops report

**Ops metric definitions:** the report counts only `report_ready` notifications (the WhatsApp/SMS carrying the report link). *Links sent* reconciles exactly: `links_sent = delivered + failed + in_flight` (asserted by test). OTP messages are counted separately, so the two populations never mix. Report views and PDF downloads come from `access_log`.

## 11. Reliability notes

- A sick AI provider can never stall sign-off. Every provider call has a hard 10-second timeout (`AI_TIMEOUT_MS`), generation stops attempting AI after a 25-second per-order budget (`AI_ORDER_BUDGET_MS`), and the locked template is always the floor. Every AI fallback (timeout or provider error) and every rejected AI output is recorded in the access log (`ai_summary_fallback` / `ai_summary_rejected`, with test name and provider error only - never patient identity or values), so the template-vs-AI ratio is diagnosable from the ops console. Patients see an honest per-summary chip: AI-written, AI + standard wording, or Standard wording.
- Deploy startup is deterministic: the seed never touches the network and only seeds an empty database, so restarts and redeploys never wipe data. The Voroa demo uses managed Postgres in Mumbai; the parallel Render demo uses its own Postgres copy. Locally it is SQLite on the instance filesystem.
- Provider errors are logged (test name and error only, no patient data), so template fallbacks are diagnosable in host logs.

## 12. Testing

The November 3 QA pass added report-release guards, summary-flag ownership, atomic OTP consumption, strict input errors, safe CSV identifiers and status checks, and csv-parse 7.0.3. When the app runs behind HTTPS, `BASE_URL` sets Secure on the HttpOnly, SameSite=Lax cookies; local HTTP remains usable. A production dependency audit reports zero known advisories at this check; that is not a security certification.

Messages render UTC event timestamps in India Standard Time with an explicit IST label; the stored event time and audit ordering are not rewritten. Three date tests cover UTC, midnight rollover and explicit offsets.

Signed CSV exports use a single database transaction for row ingestion and release. All rows load before any link, message, summary or callback is created. Exact repeats are ignored, amended signed results are held, and a failed release rolls back for retry. PostgreSQL uses a transaction-level import advisory lock and an order row lock. The mocked outbox is transactional; a future real provider needs a durable dispatch worker. PDF cache files sit outside the database transaction and can leave replaceable orphan files on a failed attempt.

`npm test` runs **78 vitest integration tests** against the real app on a temp database:

- `tests/api.test.js` (33): flag rules (normal/high/low/critical), summary-engine safety (critical suppressed, unknown suppressed, disclaimer present, three languages), patient OTP login + consent + family scoping, patient self-registration (new mobile cannot save without consent, registers empty with consent, can request a replacement OTP before first verify, existing mobile is told to log in, OTP verify creates the self grant over the empty record) and its identity-linkage boundaries (name-only import never attaches to a self-registered identity, same-mobile different-name import stays a separate patient, mobile+name import raises a pending merge instead of converging, ambiguous name-only rows are held with a staff-facing error), grant-based authorization (no grant -> not registered, walk-in refuses without the staff attestation or registration consent, verify-contact unlocks an imported patient once, rejected merges stay separate, a merge confirm without explicit staff attestation is refused with 400, revoking a contact grant immediately closes active secure-link sessions with 403 on report and PDF, and all 31 per-test templates exist in both directions and all three languages), the full sign-off pipeline (link + message + summaries + callback task), secure link flow (expiry, OTP gate, wrong OTP attempts), staff console (resend, task completion, flag review), CSV import edge cases, manual front-desk order entry (create -> sign-off -> patient portal delivery, front-desk attachment to a self-registered account, role + input validation), and lab-verified delegation (grant/revoke, one patient only).
- `tests/import-ready.test.js` (8): mixed-row Ready export release, repeat idempotence, changed signed results held, failed release rollback/retry, and incomplete orders held.
- `tests/qa-adversarial.test.js` (5): concurrent OTP one-time consume, strict age, malformed/oversize JSON, invalid routes/injection-shaped input, expiry/purpose.
- `tests/qa-boundaries.test.js` (4): concurrent desk orders, conservative numeric/range parsing, empty signoff refusal.
- `tests/cookie.test.js` (2): isolated HTTP/HTTPS configuration, matching login/logout cookies and revoked sessions.
- `tests/security.test.js` (9): anonymous and cross-patient denial, release/PDF guards, secure-link scope, OTP limits, flags and review roles.
- `tests/dates.test.js` (3): Messages UTC-to-IST display, midnight date rollover and explicit offsets.
- `tests/pdf-signoff.test.js` (1): first PDF gets persisted signer/time.
- `tests/sms.test.js` (8): the optional real-sender path: mock by default, the row-locked budget claim cannot double-spend, provider rejections are labelled distinctly from mock sends, and the recipient gate holds.
- `tests/resilience.test.js` (3): a hanging provider still falls back fast, a silent server hits the hard timeout, and the seed skips a populated database.
- `tests/liswatch.test.js` (2): a CSV dropped in the watch folder is imported through the same pipeline and moved to `imported/`; a malformed file is moved to `failed/` and logged, never silently dropped.

**Test-dialect caveat, stated plainly:** the suite runs on SQLite. Two bugs in the ops report (`date()` on a TEXT column; `day` as a bare column alias) were valid SQLite but invalid Postgres and only surfaced on the live deploy - found by hitting the deployed endpoint, fixed, and re-verified live. SQL is written in the shared dialect (`substr()`, `AS` aliases, positional GROUP BY) to keep both engines happy; a CI job against real Postgres is future work. After every deploy the live API is smoke-checked directly (auth, each role, the report endpoint) before the build is called ready.

## 13. Design decisions and trade-offs

- **Assignment scope:** messages and external systems are mocked, as the brief permits. The demo shows sign-off, link generation, OTP access, delivery-state simulation and resend using synthetic data.
- **LIS integration:** the folder watcher is implemented and tested locally. The hosted demo uses manual CSV import; unattended intake from the lab's export folder is not connected.
- **Hosting:** the primary app and database run in Mumbai. Free hosting may sleep and has no automatic database backups; PDFs regenerate from database records.
- **Before real patient use:** a pathologist must approve clinical thresholds and summary wording, and privacy/security controls need production review. Hosting in India alone is not proof of DPDP compliance.
