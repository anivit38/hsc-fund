// Express entrypoint for the Render backend. This is the only process that ever
// touches the database file — the React app (hosted separately on Firebase)
// talks to it exclusively over this REST API with a bearer JWT, mirroring the
// supabase-js + Edge Functions split in the spec: reads/writes go through
// policies.js (RLS), privileged actions go through functions.js (Edge Functions),
// and the client can never do anything either of those doesn't allow.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { setStorageAdapter } from './store.js';
import { createFileStorage } from './nodeStorage.js';

// Durable storage: a real Postgres database (Neon, Supabase, RDS, ...) when
// DATABASE_URL is set — survives Render restarts and idle-sleep cycles, unlike
// a plain file on Render's ephemeral disk. Falls back to a local JSON file for
// local development when no DATABASE_URL is configured.
let storageDescription;
if (process.env.DATABASE_URL) {
  const { createPgStorage } = await import('./pgStorage.js');
  setStorageAdapter(createPgStorage());
  storageDescription = 'Postgres (DATABASE_URL)';
} else {
  const fileStorage = createFileStorage();
  setStorageAdapter(fileStorage);
  storageDescription = `file (${fileStorage.file}) — NOT durable on Render's free tier; set DATABASE_URL for a real database`;
}

const { bootDatabase } = await import('./seed.js');
const { getState } = await import('./store.js');
const { select, insert, update, remove, profileOf } = await import('./policies.js');
const { previewTrade, catchUp, CRON_SECRET } = await import('./functions.js');
const { FUNCTIONS } = await import('./functions.js');
const V = await import('./views.js');
const { closeSeries } = await import('./market.js');
const { login, signup, verifyToken, publicProfile, changePassword } = await import('./auth.js');
const { refreshLiveHistory, refreshQuotes, getQuotes } = await import('./liveMarket.js');
const { lastCompletedSession } = await import('./calendar.js');

const PORT = process.env.PORT || 8080;
const LIVE_MARKET = process.env.LIVE_MARKET !== 'false';
const ORIGIN = process.env.CORS_ORIGIN; // e.g. https://your-app.web.app — comma-separated for multiple

console.log(`[boot] live market data: ${LIVE_MARKET ? 'on (Yahoo Finance)' : 'off (simulated only)'}`);
console.log(`[boot] storage: ${storageDescription}`);

// Load (or seed) the database first, so we know the real inception date and
// ticker list before asking Yahoo for anything.
await bootDatabase();
console.log(`[boot] database ready at session ${getState().clock.date}, NAV $${Math.round(V.nav(getState())).toLocaleString()}`);

if (LIVE_MARKET) {
  const s0 = getState();
  const liveTickers = s0.securities.filter((x) => x.pricing === 'market').map((x) => x.ticker);
  await refreshLiveHistory(liveTickers, s0.fund_config.inception_date)
    .then(({ ok, failed }) => console.log(`[boot] live history: ${ok.length} ok, ${failed.length} fell back to the simulator`))
    .catch((e) => console.warn('[live-market] initial refresh failed', e));
  catchUp(lastCompletedSession()); // re-run today's fills/NAV now that live prices are in
}

// Re-pull live history and re-run the scheduler periodically so the fund keeps
// moving forward on its own between requests, exactly like the pg_cron jobs in
// the spec (run_fills an hour after the open, run_nav 30 min after the close —
// approximated here by just catching up to the last completed session).
async function tick() {
  try {
    if (LIVE_MARKET) {
      const s = getState();
      const liveTickers = s.securities.filter((x) => x.pricing === 'market').map((x) => x.ticker);
      await refreshLiveHistory(liveTickers, s.fund_config.inception_date);
      await refreshQuotes(liveTickers);
    }
    catchUp(lastCompletedSession());
  } catch (e) {
    console.warn('[scheduler] tick failed', e);
  }
}
tick();
setInterval(tick, 15 * 60 * 1000);

// ---- HTTP layer -----------------------------------------------------------------

const app = express();
app.use(cors({ origin: ORIGIN ? ORIGIN.split(',').map((s) => s.trim()) : true, credentials: false }));
app.use(express.json({ limit: '256kb' }));

const redact = (table, rows) => (table === 'profiles' ? (Array.isArray(rows) ? rows.map(publicProfile) : publicProfile(rows)) : rows);

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.uid = token ? verifyToken(token) : null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.uid) return res.status(401).json({ error: 'Missing or invalid token' });
  next();
}

app.use(auth);

// Render's free tier suspends the process after ~15 minutes of no traffic, so the
// setInterval scheduler above can go quiet for a while. This is a cheap synchronous
// safety net: whatever request wakes the process up first also catches the
// simulated calendar up to today using whatever live history is already cached,
// before that request is served.
app.use((req, res, next) => {
  try {
    catchUp(lastCompletedSession());
  } catch (e) {
    console.warn('[scheduler] catch-up on request failed', e);
  }
  next();
});

const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req, res);
    res.json(result ?? { ok: true });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ error: e.message || 'Internal error', details: e.details });
  }
};

app.get('/api/health', (req, res) => {
  const s = getState();
  res.json({
    ok: true, date: s?.clock?.date, nav: s ? Math.round(V.nav(s)) : null, live_market: LIVE_MARKET,
    storage: process.env.DATABASE_URL ? 'postgres' : 'file',
    member_count: s?.profiles?.length ?? null,
  });
});

app.post(
  '/api/auth/login',
  handle((req) => login(req.body?.email, req.body?.password)),
);

app.post(
  '/api/auth/signup',
  handle((req) => signup(req.body || {})),
);

app.get(
  '/api/auth/me',
  requireAuth,
  handle((req) => ({ profile: publicProfile(profileOf(getState(), req.uid)) })),
);

app.post(
  '/api/auth/change-password',
  requireAuth,
  handle((req) => changePassword(req.uid, req.body?.current_password, req.body?.new_password)),
);

app.get(
  '/api/select/:table',
  requireAuth,
  handle((req) => redact(req.params.table, select(getState(), req.uid, req.params.table))),
);

app.post(
  '/api/insert/:table',
  requireAuth,
  handle((req) => redact(req.params.table, insert(req.uid, req.params.table, req.body))),
);

app.patch(
  '/api/update/:table/:id',
  requireAuth,
  handle((req) => redact(req.params.table, update(req.uid, req.params.table, req.params.id, req.body))),
);

app.delete(
  '/api/remove/:table/:id',
  requireAuth,
  handle((req) => remove(req.uid, req.params.table, req.params.id)),
);

const VIEWS = {
  summary: (args) => V.summary(getState()),
  book: () => V.book(getState()),
  exposures: () => V.exposures(getState()),
  nav_series: () => V.navSeries(getState()),
  benchmark_series: (args) => V.benchmarkSeries(getState(), args.ticker),
  sleeve_index: (args) => V.sleeveIndex(getState(), args.sleeve_id),
  price_series: (args) => closeSeries(getState(), args.ticker),
  leaderboard: () => V.leaderboard(getState()),
  pending_post_mortem: (args) => V.pendingPostMortem(getState(), args.user_id ?? args.uid),
  preview_trade: (args) => previewTrade(getState(), args),
  live_quotes: () => getQuotes(),
};

app.get(
  '/api/view/:name',
  requireAuth,
  handle((req) => {
    const fn = VIEWS[req.params.name];
    if (!fn) {
      const e = new Error(`Unknown view ${req.params.name}`);
      e.status = 404;
      throw e;
    }
    // A view is a read: require active AND approved membership — same gate
    // as isMember() in policies.js — not just "logged in".
    const caller = profileOf(getState(), req.uid);
    if (!caller?.active || caller.approved === false) {
      const e = new Error(caller && caller.approved === false ? 'Your account is awaiting CIO approval' : 'Not signed in');
      e.status = caller && caller.approved === false ? 403 : 401;
      throw e;
    }
    return fn(req.query);
  }),
);

app.post(
  '/api/invoke/:name',
  requireAuth,
  handle((req) => {
    const fn = FUNCTIONS[req.params.name];
    if (!fn) {
      const e = new Error(`Edge Function ${req.params.name} not found`);
      e.status = 404;
      throw e;
    }
    return fn(req.uid, req.body);
  }),
);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => console.log(`[boot] HSC Endowment API listening on :${PORT}`));
