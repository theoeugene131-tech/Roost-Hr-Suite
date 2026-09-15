# Roost backend — real login, Postgres persistence, server-side payroll

Express + Postgres API that replaces the browser-only localStorage flow for
the trust-critical data (employees + payroll). Trainings, leave, attendance,
documents and reviews stay in the frontend's offline-first localStorage for now.

## What it does

- `POST /api/auth/signup` — company owner creates company + owner login
- `POST /api/auth/login` — email + password → JWT (14 days)
- `POST /api/auth/invite-employee` (owner/admin) — one-time invite link for an
  employee to set their own password
- `POST /api/auth/accept-invite` — employee sets password → JWT (employee role)
- `GET/POST/PATCH/DELETE /api/employees` — roster; employees only ever see
  their own record. Bank account, NIN, PAYE TIN, pension PIN, NSITF number are
  AES-256-GCM encrypted at rest.
- `GET /api/payroll` — payroll runs (employees see only their own lines)
- `POST /api/payroll/run` — server computes CRA + PAYE + pension + NHF as the
  single source of truth, stores the run

## Run locally

```bash
# 1. Postgres (Docker) — repo default expects port 5433 to avoid clashes:
docker run -d --name roost-postgres \
  -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=roost \
  -p 5433:5432 postgres:16

# 2. Env:
cp .env.example .env
# generate real secrets and paste into .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # JWT_SECRET
# DATABASE_URL=postgres://postgres:devpassword@localhost:5433/roost

# 3. Install + run:
npm install
npm run dev   # http://localhost:4001  (GET /health)
```

## Point the frontend at it

```bash
# in the repo root, for local dev (gitignored):
echo "NEXT_PUBLIC_API_URL=http://localhost:4001" > .env.local
npm run dev   # http://localhost:3000 — cloud login screen appears
```

Without `NEXT_PUBLIC_API_URL` the frontend keeps its current offline-first
localStorage behaviour — the backend is strictly opt-in, so the Vercel deploy
keeps working even with no backend configured.

## Deploy

- Backend: Railway / Render / any Node host. Set `PORT`, `JWT_SECRET`,
  `ENCRYPTION_KEY`, `DATABASE_URL` (managed Postgres, e.g. Supabase/Railway),
  `APP_URL` (frontend URL, used in invite links).
- Frontend: set `NEXT_PUBLIC_API_URL` to the backend URL in Vercel env vars.
- Schema is auto-created on boot (`ensureSchema`) — no migrations to run.
- Back up `ENCRYPTION_KEY` securely: losing it makes encrypted fields
  (bank accounts, NIN, TINs, PINs) permanently unreadable.
