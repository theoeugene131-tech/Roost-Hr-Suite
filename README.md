# Roost — Payroll, HR & Compliance

> **For small teams of 5–20.** Works **online and offline**. Built from `roost-app.html` design.

**Live features:** Team management, Run Payroll (PAYE/Pension/NHF estimates), Compliance calendar (PAYE/Pension/NHF/NSITF), Reviews, Hiring Kanban, Reports, Employee Self-Service + Role switcher (Owner / HR Admin / Employee). Data persists offline via `localStorage` + PWA cache and syncs when back online.

## Quick start

```bash
cd roost
npm install
npm run dev   # http://localhost:3000
npm run build && npm start
```

## Offline-first

- All state saved to `localStorage` key `roost_state_v2` — no backend required for demo.
- `public/sw.js` caches shell + assets (cache-first, network fallback).
- Offline banner + toast indicates sync status; mutations queued to `roost_pending` and replay when `navigator.onLine` returns.
- Installable PWA: `manifest.json` + icons.

> Replace `lib/store.js` with IndexedDB/Backend sync when adding a real API (e.g., Upstash/Prisma/Supabase).

## Deploy

### GitHub
```bash
cd roost
git init
git add .
git commit -m "feat: Roost v1 offline-first"
gh repo create roost --public --source=. --remote=origin --push
# or manually:
git remote add origin https://github.com/<you>/roost.git
git branch -M main
git push -u origin main
```

### Vercel
- Import GitHub repo at https://vercel.com/new
- Framework preset: **Next.js**, Build `npm run build`, Output `.next`
- Or via CLI: `npm i -g vercel && vercel --prod`

`vercel.json` is included.

## Structure
```
app/
  layout.js   # metadata + fonts
  page.js     # full app (client component)
  globals.css
lib/store.js  # offline store
public/
  manifest.json
  sw.js
  icon-*.png
```

## Nigerian payroll math
Simplified PAYE bands + 8% employee/10% employer pension + 2.5% NHF — estimates only (not tax advice).

## Credits
Design from `roost-app.html` by user. Stack: Next.js 14, React 18, Tailwind.
