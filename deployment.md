# LabLink - Deployment

LabLink is a single Node.js process that serves the API and the built React client, with
SQLite stored on disk. Any host that runs Node.js 20+ works. No external paid services are
required: SMS/WhatsApp messages are written to a local `outbox` table (mocked).

## 1. Run locally

Prerequisites: Node.js 20+ and npm.

```bash
git clone <repo-url>
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
| `DATA_DIR` | `./data` | Where the SQLite DB and generated PDFs live |
| `BASE_URL` | `http://localhost:PORT` | Public base URL used inside report links - set this to the real https URL in production |
| `PASSWORD_SALT` | `lablink-dev-salt` | Salt for staff password hashing - set a unique random value in production |
| `AI_API_KEY` | _(unset)_ | Key for a paid/production AI provider. Unset = free demo mode using locked templates |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible chat API endpoint; a keyless endpoint works without `AI_API_KEY` (demo-proven) |
| `AI_MODEL` | `gpt-4o-mini` | Model used for summaries |

## 2b. Demo logins (synthetic data only, after `npm run seed`)

| Role | Login |
| --- | --- |
| Patient | mobile `9000000001` (Lakshmi's family) or `9000000004` (Srinivas & Padma) - OTP appears in the server log and the staff console's Messages view |
| Front desk | username `frontdesk`, password `Lab@2026` |
| Doctor | mobile `9000000020` (Dr. P. Anitha) - OTP login |
| Lab owner / ops | username `ops`, password `Ops@2026` |
| Pathologist (import + sign-off) | username `patho`, password `Patho@2026` |

## 3. Deploy on a free tier (example: Render)

1. Push this repo to GitHub.
2. In Render: New > Web Service > connect the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm run seed && npm start`
   (`seed` is idempotent for a fresh database; remove it once real data exists.)
5. Set environment variables: `BASE_URL=https://<your-app>.onrender.com` and a random `PASSWORD_SALT`.
6. Add a persistent disk mounted at `/opt/render/project/src/data` (or set `DATA_DIR` to the
   mount path) so the SQLite database and PDFs survive restarts. Without a disk the data
   resets on every redeploy - acceptable for a demo, not for production.

The same steps work on Railway, Fly.io or a small VM (`npm ci && npm run build && npm start`
behind any HTTPS reverse proxy).

## 4. India data residency note

The free-tier hosts above run outside India. For real Indian patient data,
deploy in an India region (e.g. AWS `ap-south-1` Mumbai or Azure Central
India) so reports and phone numbers stay in-country. This demo does not claim
DPDP residency compliance.

## 5. Production checklist (what a real rollout still needs)

- HTTPS in front of the app (links and OTPs must never travel over plain HTTP).
- A real SMS/WhatsApp provider (e.g. MSG91/Twilio) replacing the mocked outbox - the
  integration point is `server/outbox.js`.
- Set a strong unique `PASSWORD_SALT` and rotate the demo staff passwords.
- A persistent volume for `DATA_DIR` plus database backups.
- For AI-written summaries in production, a paid compliant provider via
  `AI_API_KEY` (a keyless free endpoint via `AI_BASE_URL` was used to prove the
  AI path in the demo, but is not suitable for real patient data); without
  either, the tested locked templates serve summaries at zero cost.
- The lab's pathologist must review the SAMPLE critical thresholds in
  `server/kb.js` before real use.
- Postgres instead of SQLite if multiple lab branches ever share one deployment.
