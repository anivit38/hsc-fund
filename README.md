# HSC Fund

A paper-trading platform for a school investment club's mock fund — role-aware
(Analyst / Portfolio Manager / CIO / Faculty Advisor), long-only, with a real
governance model: analysts pitch, PMs approve inside their sleeve, the CIO
executes at Investment Committee, orders fill at the next session's open, NAV
is computed nightly, and every trade, override and role change is audited.

The universe isn't just stocks — it spans equities, ETFs, fixed income, listed
and direct **real estate**, commodities, digital assets and private-market fund
units, each with its own risk limits (`src/server/universe.js`).

## Architecture

```
React (Vercel/Firebase Hosting)          Express API (Render)
  role-aware routing                       policies.js   — row-level security
  no privileged ops, anon-equivalent  ───►  functions.js  — "Edge Functions"
  client (src/api.js)                       market.js + liveMarket.js — pricing
                                             store.js      — JSON "Postgres"
```

This mirrors the platform spec directly: the client can `select`/`insert`/
`update` through **policies.js** (the RLS layer — see the extensive comment
block and `src/server/securityTests.js` for the attack scenarios it defends
against) or `invoke` a privileged **Edge Function** in `functions.js`, which
re-derives the caller's role from their JWT every time and never trusts
anything the client claims about itself. `orders`, `fills`, `cash_ledger`,
`nav_snapshots` and `audit_log` have no client-writable policy at all — every
write to them happens inside a function running with full server privileges.

See **DEPLOY.md** to put this live on Firebase Hosting + Render, and the doc
comments at the top of each `src/server/*.js` file for how each piece works.

## Quick start

```
npm install
npm run server      # API on :8080
npm run dev          # frontend on :5173 (in a second terminal)
```

Sign in as any seeded member (see `src/server/universe.js` for the roster) —
password `welcome2026` for everyone until it's changed.

```
npm run test:security   # RLS/permission attack suite + a full pitch→fill→NAV cycle
```
