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

## 4. Production checklist (what a real rollout still needs)

- HTTPS in front of the app (links and OTPs must never travel over plain HTTP).
- A real SMS/WhatsApp provider (e.g. MSG91/Twilio) replacing the mocked outbox - the
  integration point is `server/outbox.js`.
- Set a strong unique `PASSWORD_SALT` and rotate the demo staff passwords.
- A persistent volume for `DATA_DIR` plus database backups.
- Postgres instead of SQLite if multiple lab branches ever share one deployment.
