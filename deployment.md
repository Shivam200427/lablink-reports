# LabLink - Deployment

**India demo:** https://lablink-reports.getvoroa.com (Voroa app and managed PostgreSQL in Mumbai, verified November 3, 2026). **Parallel fallback:** https://lablink-reports.onrender.com (Render, Singapore). Both remain live; no cutover or Render shutdown has been made.

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
| `AI_API_KEY` | _(unset)_ | Provider key. Without an enabled provider, summaries use locked templates |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible chat API endpoint. The demo used Google's Gemini free tier (see the TDD); keyless endpoints were tried and dropped as unreliable |
| `AI_MODEL` | `gpt-4o-mini` | Model used for summaries |

## 2b. Demo logins (synthetic data only, after `npm run seed`)

| Role | Login |
| --- | --- |
| Patient | mobile `9000000001` (Lakshmi's family) or `9000000004` (Srinivas & Padma) - OTP appears in the staff console's Messages view. These seeded families log in through system/demo fixture grants (labeled as such in the console, never attributed to a staff member); any patient created later - by import or walk-in - can log in only after the front desk verifies their contact number |
| Front desk | username `frontdesk`, password `Lab@2026` |
| Doctor | mobile `9100000002` (Dr. P. Anitha) - OTP login |
| Lab owner / ops | username `ops`, password `Ops@2026` |
| Pathologist (import + sign-off) | username `patho`, password `Patho@2026` |

## 3. Deploy on a free tier (example: Render)

1. Push this repo to GitHub.
2. In Render: New > Web Service > connect the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`. Import or seed synthetic data explicitly before first use; never run a destructive reseed on an existing database.
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

The current Voroa demo app and managed PostgreSQL are in Mumbai; the parallel
Render fallback remains in Singapore (Render has no India region on any plan,
verified on Render's region docs). This is infrastructure placement, not legal
or DPDP certification. For real Indian patient data, use an India region with
backups, retention, monitoring, incident handling and legal review.

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

## Current Voroa deployment

- Runtime: Node.js; build `npm install && npm run build`; start `npm start`.
- Health path `/api/health` confirms the server responds. Live login/data-flow checks are separate from that shallow liveness response.
- App and PostgreSQL are in Mumbai. `DATABASE_URL` points to managed PostgreSQL with TLS. `BASE_URL` is the Voroa URL above.
- `PASSWORD_SALT` matches the imported synthetic staff hashes. AI provider variables are configured; validated AI output falls back to locked templates on error or unsafe output.
- FAST2SMS variables were not copied to Voroa. All notifications/OTPs there stay in the mocked Messages outbox; nothing is sent to a real phone.
- Database import was independently checked before later user/test activity: 17 patients, 19 orders, 63 results and 35 summaries, with the erased record absent across all 18 tables. Later records are not part of that restore baseline.
- Git-URL deployments do not auto-deploy on push: trigger a redeploy after updating this repository. Render still auto-deploys the main branch.
- The free service can sleep when idle. Temporary public-health monitoring was paused after the monitoring request received a 403; no keep-awake coverage is currently active. This is not an uptime guarantee or part of the product architecture.
- App and database share 750 free running hours per month. Continuous use of both consumes about 720 pooled hours in 15 days. No paid plan or payment method was added.
- Filesystem storage is ephemeral. PDFs regenerate from PostgreSQL after a restart; unprocessed CSV files in the watch folder do not have durable storage. Folder arrivals do not wake a sleeping app. The free Render demo has the same sleep/ephemeral-file limitation.
- The watcher polls `data/lis-incoming` every 5 seconds while the process runs. Production needs a durable LIS handoff and an always-running worker; this demo does not alter the client's LIS or ingest its real signed PDFs.
- A Ready/signed CSV order is released only after its rows are loaded: one expiring link, mocked message, summaries or critical callback. Exact repeated rows are ignored; changed already-signed results are held for an amended-report workflow. Database release failure rolls back the transaction so a retry does not duplicate links/messages/callbacks.

Current provider constraints were checked against https://getvoroa.com/docs/free-instances/ and https://getvoroa.com/docs/idle-sleep/ on November 3, 2026. Render free constraints: https://render.com/docs/free. These demo facts are not a legal/compliance certification or an assertion about production readiness.
