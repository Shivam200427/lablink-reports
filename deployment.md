# LabLink - Deployment

**Live demo instance:** https://lablink-reports.onrender.com (Render free tier, Singapore; sleeps when idle - first load can take ~50s; data persists on Render's free Postgres until its 2026-12-02 expiry). The steps below are exactly how it was deployed, and how to reproduce it.

LabLink is a single Node.js process that serves the API and the built React client.
Locally it stores everything in SQLite on disk; when `DATABASE_URL` is set it uses
Postgres instead (same schema, same code path). Any host that runs Node.js 20+ works.
No external paid services are required: SMS/WhatsApp messages are written to a local
`outbox` table (mocked).

## 1. Run locally

Prerequisites: Node.js 20+ and npm.

```bash
git clone https://github.com/Shivam200427/lablink-reports.git
cd lablink-reports
npm install
npm run seed     # synthetic demo data (patients, orders, staff, doctors)
npm run build    # builds client/dist
npm start        # http://localhost:3000
```

Tests: `npm test`

## 2. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Where the SQLite DB (local mode) and generated PDFs live |
| `DATABASE_URL` | _(unset)_ | Postgres connection string. Unset = SQLite mode. Set = Postgres mode |
| `AI_REASONING_EFFORT` | _(unset)_ | Optional provider hint; `none` disables Gemini's hidden reasoning (needed for short summaries) |
| `BASE_URL` | `http://localhost:PORT` | Public base URL used inside report links - set this to the real https URL in production |
| `PASSWORD_SALT` | `lablink-dev-salt` | Salt for staff password hashing - set a unique random value in production |
| `AI_API_KEY` | _(unset)_ | Key for a paid/production AI provider. Unset = free demo mode using locked templates |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible chat API endpoint. The demo used Google's Gemini free tier (see the TDD); keyless endpoints were tried and dropped as unreliable |
| `AI_MODEL` | `gpt-4o-mini` | Model used for summaries |

## 2b. Demo logins (synthetic data only, after `npm run seed`)

| Role | Login |
| --- | --- |
| Patient | mobile `9000000001` (Lakshmi's family) or `9000000004` (Srinivas & Padma) - OTP appears in the server log and the staff console's Messages view. These seeded families log in through system/demo fixture grants (labeled as such in the console, never attributed to a staff member); any patient created later - by import or walk-in - can log in only after the front desk verifies their contact number |
| Front desk | username `frontdesk`, password `Lab@2026` |
| Doctor | mobile `9100000002` (Dr. P. Anitha) - OTP login |
| Lab owner / ops | username `ops`, password `Ops@2026` |
| Pathologist (import + sign-off) | username `patho`, password `Patho@2026` |

## 3. Deploy on a free tier (example: Render)

1. Push this repo to GitHub.
2. In Render: New > Web Service > connect the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm run seed && npm start`
   (`seed` only seeds an EMPTY database; pass `--wipe` to force a fresh demo fixture.)
5. Create a free Render Postgres (Singapore, 1 GB, no card) and set `DATABASE_URL`
   to its **internal** connection string so the web service reaches it over Render's
   private network. Free Postgres expires 30 days after creation (14-day grace
   before deletion) - this demo's instance expires **2026-12-02** and must be
   replaced or removed by then.
6. Set environment variables: `BASE_URL=https://<your-app>.onrender.com`, a random
   `PASSWORD_SALT`, and optionally the AI variables (`AI_BASE_URL`, `AI_MODEL`,
   `AI_API_KEY`, `AI_REASONING_EFFORT`) for the Gemini free-tier configuration
   described in the TDD.
7. Persistence on free tier: with `DATABASE_URL` set, data survives restarts and
   redeploys (generated PDFs are re-created on demand from stored results - the
   ephemeral filesystem only loses the cached files). Without it, SQLite lives on
   the ephemeral filesystem and resets to the seed on every redeploy.

The same steps work on Railway, Fly.io or a small VM (`npm ci && npm run build && npm start`
behind any HTTPS reverse proxy).

## 4. India data residency note

The free-tier hosts above run outside India (Render has no India region on any
plan - verified on Render's region docs). The brief asks for hosting in India,
so this demo leaves that constraint openly unmet; no legal or residency
compliance is claimed either way. For real Indian patient data, deploy in an
India region (e.g. AWS `ap-south-1` Mumbai or Azure Central India) so reports
and phone numbers stay in-country.

## 5. Production checklist (what a real rollout still needs)

- HTTPS in front of the app (links and OTPs must never travel over plain HTTP).
- Real SMS: off by default (mocked outbox). Optional demo-grade Fast2SMS Quick SMS via
  `FAST2SMS_API_KEY` + `FAST2SMS_ALLOWED_RECIPIENT` + `FAST2SMS_TOTAL_BUDGET` (see README).
  Fast2SMS requires one paid transaction of Rs 100+ before its API route works - the free
  signup coupon is not enough (verified: the API rejects pre-billing until then), so a fresh
  demo account stays on the mocked outbox unless the owner recharges:
  prepaid wallet, approx. Rs 7/SMS, real sends restricted to the allowed recipient,
  provider acceptance recorded honestly (`sent`, never fake `delivered`), mocked fallback
  on failure. Production India delivery needs a DLT-registered transactional route
  (operator entity registration, business documents) - that is the real-rollout step.
- Set a strong unique `PASSWORD_SALT` and rotate the demo staff passwords.
- A persistent volume for `DATA_DIR` plus database backups.
- For AI-written summaries in production, a paid compliant provider via
  `AI_API_KEY` (the demo proved the AI path against Google's Gemini free tier;
  a free tier trains on submitted content and is not suitable for real patient
  data); without a provider configured, the tested locked templates serve
  summaries at zero cost.
- The lab's pathologist must review the SAMPLE critical thresholds in
  `server/kb.js` before real use.
- LIS export-folder watch: set `LIS_WATCH_DIR` to the folder the LIS writes
  exports to (default `<data dir>/lis-incoming`). The app polls it every 5s and
  imports new CSVs through the same pipeline as the manual upload, moving each
  file to `imported/` or `failed/`. The folder must be on a disk the app host
  can read - on Render's free tier the filesystem is ephemeral and unreachable
  from a lab machine, so use the manual import there, or run the app on a host
  the LIS can write to (e.g. a small on-prem box) for unattended imports.
- Postgres instead of SQLite if multiple lab branches ever share one deployment
  (the demo already runs on Postgres; local runs use SQLite).
