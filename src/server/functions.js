// Edge Functions. Each runs "as service role" (it may write any table) and so
// each one re-derives the caller from the JWT and checks the role itself. Nothing
// in the request body is trusted for authorisation.

import { tx, getState, uuid } from './store.js';
import { ApiError } from './errors.js';
import * as V from './views.js';
import { stamp } from './clock.js';
import { isSession, isWeekend, addDays, nextSession, lastCompletedSession, previousMonth, monthLabel } from './calendar.js';
import { ensureSessions, barOn } from './market.js';
import { ASSET_CLASSES, ROLES } from './universe.js';
import { hashPassword } from './auth.js';

// Lives only on the server (a Supabase secret in production).
export const CRON_SECRET = 'svc-cron-7f3a91c2';

const round2 = (x) => Math.round(x * 100) / 100;
const money = (x) => `$${Math.round(x).toLocaleString('en-US')}`;

// ---- plumbing -----------------------------------------------------------------

function resolveCaller(s, jwtUid) {
  const me = jwtUid ? s.profiles.find((p) => p.user_id === jwtUid) : null;
  if (!me) throw new ApiError(401, 'Missing or invalid JWT');
  if (!me.active) throw new ApiError(403, 'This account is inactive');
  if (me.approved === false) throw new ApiError(403, 'Your account is awaiting CIO approval');
  return me;
}

function requireRole(me, ...roles) {
  if (!roles.includes(me.role)) {
    throw new ApiError(403, `Forbidden: requires role ${roles.join(' or ')}, but your profile role is ${me.role}`);
  }
}

function requireCron(secret, name) {
  if (secret !== CRON_SECRET) throw new ApiError(401, `${name} can only be triggered by the scheduler (cron secret required)`);
}

export function audit(s, actor_id, action, entity, entity_id, payload, at) {
  s.seq.audit += 1;
  s.audit_log.push({ id: s.seq.audit, actor_id, action, entity, entity_id: entity_id ?? null, payload: payload ?? null, at: at ?? stamp(s) });
}

function jobRun(s, job_name, status, detail, at) {
  s.seq.job += 1;
  s.job_runs.push({ id: s.seq.job, job_name, status, detail, ran_at: at ?? stamp(s) });
  if (s.job_runs.length > 400) s.job_runs.splice(0, s.job_runs.length - 400);
}

// ---- risk engine ----------------------------------------------------------------

/** Size an order and run every risk check against the current book. Read-only. */
export function previewTrade(s, { ticker, side, kind, target_wt_pct, qty: fixedQty }) {
  const cfg = s.fund_config;
  const sec = V.security(s, ticker);
  if (!sec) throw new ApiError(404, `Unknown ticker ${ticker}`);
  const price = sec.last_close;
  const rows = V.book(s);
  const cash = V.cash(s);
  const nav = V.nav(s, rows);
  const held = rows.find((r) => r.ticker === ticker);
  const heldQty = held?.qty ?? 0;
  const currentValue = heldQty * price;

  let qty;
  if (fixedQty != null) qty = fixedQty;
  else if (side === 'buy') qty = Math.floor(((nav * target_wt_pct) / 100 - currentValue) / price);
  else if (kind === 'exit') qty = heldQty;
  else qty = Math.floor((currentValue - (nav * target_wt_pct) / 100) / price);
  qty = Math.max(0, qty);

  const gross = qty * price;
  const fee = round2((gross * sec.fee_bps) / 10000);
  const dir = side === 'buy' ? 1 : -1;
  const newValue = currentValue + dir * gross;
  const newCash = cash - dir * gross - fee;
  const newNav = nav - fee;
  const others = rows.filter((r) => r.ticker !== ticker);
  const sectorValue = others.filter((r) => r.sector === sec.sector).reduce((a, r) => a + r.market_value, 0) + newValue;
  const classValue = others.filter((r) => r.asset_class === sec.asset_class).reduce((a, r) => a + r.market_value, 0) + newValue;
  const investedValue = others.reduce((a, r) => a + r.market_value, 0) + newValue;
  const names = others.length + (newValue > 0 ? 1 : 0);
  const pct = (v) => (v / newNav) * 100;

  const weightAfter = pct(newValue);
  const sectorAfter = pct(sectorValue);
  const classAfter = pct(classValue);
  const investedAfter = pct(investedValue);
  const classLimit = cfg.asset_class_limits[sec.asset_class] ?? 100;
  const buying = side === 'buy';
  const cashNeeded = gross * (1 + cfg.cash_buffer_pct / 100) + fee;
  const f1 = (x) => `${x.toFixed(1)}%`;

  const checks = [
    { key: 'tradable', label: 'Security is tradable', ok: sec.status === 'active', hard: true, detail: sec.status === 'active' ? 'Active' : `Security is ${sec.status}` },
    { key: 'qty', label: 'Quantity at least 1', ok: qty >= 1, hard: true, detail: `${qty.toLocaleString()} × ${money(price)} (${sec.unit})` },
    buying
      ? null
      : { key: 'long_only', label: 'Long-only: cannot sell more than held', ok: qty <= heldQty, hard: true, detail: `Holding ${heldQty.toLocaleString()}` },
    {
      key: 'position',
      label: `Position between ${cfg.min_position_pct}% and ${cfg.max_position_pct}%`,
      ok: newValue <= 0.000001 ? !buying : weightAfter >= cfg.min_position_pct - 1e-9 && weightAfter <= cfg.max_position_pct + 1e-9,
      detail: `${f1(pct(currentValue))} → ${f1(weightAfter)}`,
    },
    { key: 'sector', label: `${sec.sector} ≤ ${cfg.max_sector_pct}%`, ok: !buying || sectorAfter <= cfg.max_sector_pct + 1e-9, detail: `→ ${f1(sectorAfter)}` },
    { key: 'asset_class', label: `${ASSET_CLASSES[sec.asset_class]?.label ?? sec.asset_class} ≤ ${classLimit}%`, ok: !buying || classAfter <= classLimit + 1e-9, detail: `→ ${f1(classAfter)}` },
    { key: 'invested', label: `Invested ≤ ${cfg.max_invested_pct}%`, ok: !buying || investedAfter <= cfg.max_invested_pct + 1e-9, detail: `→ ${f1(investedAfter)}` },
    { key: 'cash', label: `Cash covers cost +${cfg.cash_buffer_pct}% buffer`, ok: !buying || cashNeeded <= cash + 1e-6, detail: buying ? `Needs ${money(cashNeeded)} of ${money(cash)}` : `Frees ${money(gross - fee)}` },
    buying && heldQty === 0
      ? { key: 'names', label: `Names ≤ ${cfg.target_names_max}`, ok: names <= cfg.target_names_max, detail: `${names} after trade` }
      : null,
  ].filter(Boolean);

  const breaches = checks.filter((c) => !c.ok);
  return {
    ticker, side, kind, qty, price, gross, fee, nav, cash,
    held_qty: heldQty,
    weight_before: pct(currentValue),
    weight_after: weightAfter,
    sector_after: sectorAfter,
    class_after: classAfter,
    invested_after: investedAfter,
    cash_after: newCash,
    checks,
    breaches,
    hard_breaches: breaches.filter((c) => c.hard),
  };
}

function createOrder(s, { pitch, ticker, side, kind, target_wt_pct, qty, actor, risk_override, override_note, at }) {
  if (s.orders.some((o) => o.ticker === ticker && o.status === 'pending_open')) {
    throw new ApiError(409, `An order for ${ticker} is already pending the next open`);
  }
  const pv = previewTrade(s, { ticker, side, kind, target_wt_pct, qty });
  if (pv.hard_breaches.length) {
    throw new ApiError(422, `Cannot trade: ${pv.hard_breaches.map((c) => c.detail).join('; ')}`, { preview: pv });
  }
  if (pv.breaches.length && !risk_override) {
    throw new ApiError(422, `Risk check failed: ${pv.breaches.map((c) => c.label).join('; ')}`, { preview: pv, overridable: true });
  }
  if (risk_override && pv.breaches.length && !String(override_note ?? '').trim()) {
    throw new ApiError(400, 'A risk override requires a note explaining why');
  }
  const order = {
    id: uuid(),
    pitch_id: pitch?.id ?? null,
    ticker,
    side,
    qty: pv.qty,
    target_wt_pct: target_wt_pct ?? null,
    ref_price: pv.price,
    status: 'pending_open',
    created_by: actor,
    risk_override: !!(risk_override && pv.breaches.length),
    override_note: risk_override && pv.breaches.length ? String(override_note).trim() : null,
    breaches: pv.breaches.map((c) => c.label),
    reject_reason: null,
    created_at: at ?? stamp(s),
    filled_at: null,
  };
  s.orders.push(order);
  return { order, preview: pv };
}

// ---- CIO functions ------------------------------------------------------------

export function execute_pitch(uid, { pitch_id, risk_override = false, override_note } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    const pitch = s.pitches.find((p) => p.id === pitch_id);
    if (!pitch) throw new ApiError(404, 'Pitch not found');
    if (pitch.status !== 'pm_approved') throw new ApiError(409, `Pitch is ${pitch.status}; only pm_approved pitches can be executed`);
    const at = stamp(s);
    if (pitch.expires_at && pitch.expires_at < at) throw new ApiError(409, 'Pitch has expired; the analyst must re-pitch with a fresh thesis');

    const { order, preview } = createOrder(s, {
      pitch, ticker: pitch.ticker, side: pitch.side, kind: pitch.kind, target_wt_pct: pitch.pm_wt_pct,
      actor: me.user_id, risk_override, override_note, at,
    });
    pitch.status = 'executed';
    pitch.order_id = order.id;
    audit(s, me.user_id, order.risk_override ? 'pitch.executed_with_override' : 'pitch.executed', 'pitches', pitch.id, {
      order_id: order.id, ticker: order.ticker, side: order.side, qty: order.qty, ref_price: order.ref_price,
      breaches: order.breaches, override_note: order.override_note,
    }, at);
    return { order, preview };
  });
}

export function shelve_pitch(uid, { pitch_id, note } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    const pitch = s.pitches.find((p) => p.id === pitch_id);
    if (!pitch) throw new ApiError(404, 'Pitch not found');
    if (pitch.status !== 'pm_approved') throw new ApiError(409, `Pitch is ${pitch.status}; only pm_approved pitches can be shelved`);
    pitch.status = 'shelved';
    pitch.cio_note = String(note ?? '').trim() || null;
    audit(s, me.user_id, 'pitch.shelved', 'pitches', pitch.id, { ticker: pitch.ticker, note: pitch.cio_note });
    return pitch;
  });
}

export function close_position(uid, { ticker, note } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    if (!String(note ?? '').trim()) throw new ApiError(400, 'A force-exit requires a note (it is recorded as a risk override)');
    const held = V.positions(s).find((p) => p.ticker === ticker);
    if (!held) throw new ApiError(409, `The fund holds no ${ticker}`);
    const at = stamp(s);
    const { order } = createOrder(s, { ticker, side: 'sell', kind: 'exit', qty: held.qty, actor: me.user_id, risk_override: true, override_note: note, at });
    order.risk_override = true;
    order.override_note = String(note).trim();
    order.force_exit = true;
    for (const p of s.pitches) {
      if (p.ticker === ticker && ['submitted', 'pm_approved'].includes(p.status) && p.side === 'buy') {
        p.status = 'shelved';
        p.cio_note = `Shelved by force-exit: ${order.override_note}`;
      }
    }
    audit(s, me.user_id, 'position.force_exit', 'orders', order.id, { ticker, qty: order.qty, note: order.override_note }, at);
    return { order };
  });
}

// Direct CIO trading, outside the pitch process entirely — for rebalancing,
// topping up an existing conviction, or trimming without waiting on a fresh
// pitch. Goes through the exact same risk engine and order/fill pipeline as
// an executed pitch (createOrder → run_fills at the next open); it's simply
// not attached to a pitch_id. Every governance rule that isn't specific to
// the pitch workflow still applies: risk limits, next-open fills, audit log.
export function quick_trade(uid, { ticker, side, target_wt_pct, qty, note, risk_override = false, override_note } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    if (!ticker) throw new ApiError(400, 'ticker is required');
    if (side !== 'buy' && side !== 'sell') throw new ApiError(400, 'side must be "buy" or "sell"');
    if (target_wt_pct == null && qty == null) throw new ApiError(400, 'Provide either a target weight (%) or an exact quantity');
    const kind = side === 'buy' ? 'entry' : 'trim';
    const at = stamp(s);
    const { order, preview } = createOrder(s, {
      ticker, side, kind, target_wt_pct: target_wt_pct ?? null, qty: qty ?? null,
      actor: me.user_id, risk_override, override_note, at,
    });
    order.note = note ? String(note).trim() : null;
    audit(
      s, me.user_id, order.risk_override ? 'trade.quick_executed_with_override' : 'trade.quick_executed', 'orders', order.id,
      { ticker, side, qty: order.qty, ref_price: order.ref_price, note: order.note, breaches: order.breaches },
      at,
    );
    return { order, preview };
  });
}

export function cancel_order(uid, { order_id } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    const order = s.orders.find((o) => o.id === order_id);
    if (!order) throw new ApiError(404, 'Order not found');
    if (order.status !== 'pending_open') throw new ApiError(409, `Order is ${order.status}; only pending orders can be cancelled`);
    order.status = 'cancelled';
    const pitch = order.pitch_id && s.pitches.find((p) => p.id === order.pitch_id);
    if (pitch?.status === 'executed') {
      pitch.status = 'pm_approved';
      pitch.order_id = null;
    }
    audit(s, me.user_id, 'order.cancelled', 'orders', order.id, { ticker: order.ticker, qty: order.qty });
    return order;
  });
}

export function manage_member(uid, { user_id, role, sleeve_id, active, approved } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    const target = s.profiles.find((p) => p.user_id === user_id);
    if (!target) throw new ApiError(404, 'Member not found');
    const next = {
      role: role ?? target.role,
      sleeve_id: sleeve_id === undefined ? target.sleeve_id : sleeve_id || null,
      active: active ?? target.active,
      approved: approved ?? target.approved ?? true,
    };
    if (!ROLES.includes(next.role)) throw new ApiError(400, `Unknown role ${next.role}`);
    // Sleeve is just an optional "primary sleeve" label now (who a PM's home
    // dashboard defaults to) — not a requirement, and not an access boundary.
    if (next.role === 'cio' || next.role === 'advisor') next.sleeve_id = null;
    const activeCios = s.profiles.filter((p) => p.role === 'cio' && p.active && p.approved !== false && p.user_id !== user_id);
    if (target.role === 'cio' && target.approved !== false && (next.role !== 'cio' || !next.active || !next.approved) && activeCios.length === 0) {
      throw new ApiError(409, 'The fund must keep at least one active, approved CIO');
    }
    const before = { role: target.role, sleeve_id: target.sleeve_id, active: target.active, approved: target.approved };
    Object.assign(target, next);
    for (const sl of s.sleeves) {
      if (sl.pm_user_id === user_id && !(next.role === 'pm' && next.sleeve_id === sl.id)) sl.pm_user_id = null;
      if (next.role === 'pm' && next.sleeve_id === sl.id) sl.pm_user_id = user_id;
    }
    audit(s, me.user_id, before.approved === false && next.approved ? 'member.approved' : 'member.updated', 'profiles', null, { user_id, before, after: next });
    return target;
  });
}

// The 12 founding members baked into src/server/universe.js for demo/seed
// purposes — every id is fixed and hardcoded there, so this list is exact,
// unlike anything created through signup or create_member (random ids).
const SEED_MEMBER_IDS = new Set([
  'u-alex', 'u-priya', 'u-liam', 'u-sofia', 'u-noah',
  'u-mia', 'u-ethan', 'u-zara', 'u-lucas', 'u-oliver', 'u-chloe', 'u-carter',
]);

/**
 * One-time cleanup for going from "demo" to "the real club": removes every
 * seeded demo member and every bit of pitch/trading history (all of which
 * originated from the demo), resets cash to the fund's starting capital, and
 * rebuilds a flat NAV history from inception to today so the dashboard chart
 * isn't empty. Leaves fund_config, sleeves, securities (the real universe and
 * its real market-data history) and every real member account untouched.
 */
export function reset_demo_data(uid) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    if (SEED_MEMBER_IDS.has(me.user_id)) {
      throw new ApiError(400, 'Sign in with your own real CIO account before resetting — a seeded demo account cannot perform this.');
    }

    const removedCount = s.profiles.filter((p) => SEED_MEMBER_IDS.has(p.user_id)).length;
    s.profiles = s.profiles.filter((p) => !SEED_MEMBER_IDS.has(p.user_id));
    for (const sl of s.sleeves) {
      if (SEED_MEMBER_IDS.has(sl.pm_user_id)) sl.pm_user_id = null;
    }

    s.pitches = [];
    s.pitch_comments = [];
    s.orders = [];
    s.fills = [];
    s.post_mortems = [];
    s.letters = [];
    s.job_runs = [];
    s.audit_log = [];
    s.seq = { audit: 0, job: 0 };
    s.position_pnl_daily = [];
    s.nav_snapshots = [];
    s.benchmarks = [];

    const at = stamp(s);
    s.cash_ledger = [{
      id: uuid(), delta: s.fund_config.inception_capital, reason: 'inception', ref_id: null,
      created_at: `${s.fund_config.inception_date}T09:00:00.000Z`,
    }];

    // Rebuild NAV/benchmark history for every real session from inception to
    // today. There are no orders left to fill, so this just lays down a flat
    // $1,000,000 line — the market-data cache (s.sessions/s.prices) is real
    // and untouched, so this replays instantly against it.
    let d = s.fund_config.inception_date;
    while (d <= s.clock.date) {
      if (isSession(d)) {
        fillsForSession(s, d);
        navForSession(s, d);
      }
      d = addDays(d, 1);
    }

    audit(s, me.user_id, 'platform.reset_demo_data', 'profiles', null, { removed_seed_members: removedCount }, at);
    return { ok: true, removed_seed_members: removedCount, members_remaining: s.profiles.length };
  });
}

export function reset_member_password(uid, { user_id, new_password } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    const target = s.profiles.find((p) => p.user_id === user_id);
    if (!target) throw new ApiError(404, 'Member not found');
    if (String(new_password ?? '').length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
    target.password_hash = hashPassword(new_password);
    audit(s, me.user_id, 'member.password_reset', 'profiles', null, { user_id });
    return { ok: true };
  });
}

export function create_member(uid, { full_name, email, role, sleeve_id, grade, password } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    if (!full_name || !email) throw new ApiError(400, 'full_name and email are required');
    const normalized = String(email).trim().toLowerCase();
    if (s.profiles.some((p) => p.email?.toLowerCase() === normalized)) throw new ApiError(409, 'A member with that email already exists');
    if (!ROLES.includes(role)) throw new ApiError(400, `Unknown role ${role}`);
    const at = stamp(s);
    const profile = {
      user_id: `u-${uuid().slice(0, 8)}`,
      full_name: String(full_name).trim(),
      email: normalized,
      role,
      sleeve_id: role === 'pm' || role === 'analyst' ? sleeve_id : null,
      grade: grade ?? null,
      active: true,
      approved: true, // a CIO adding someone directly is itself the vetting step
      created_at: at,
      password_hash: hashPassword(password && password.length >= 8 ? password : 'welcome2026'),
    };
    s.profiles.push(profile);
    if (role === 'pm') {
      const sl = s.sleeves.find((x) => x.id === sleeve_id);
      if (sl) sl.pm_user_id = profile.user_id;
    }
    audit(s, me.user_id, 'member.created', 'profiles', null, { user_id: profile.user_id, role, sleeve_id: profile.sleeve_id });
    return profile;
  });
}

export function set_security_status(uid, { ticker, status } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    const sec = V.security(s, ticker);
    if (!sec) throw new ApiError(404, `Unknown ticker ${ticker}`);
    if (!['active', 'halted', 'delisted'].includes(status)) throw new ApiError(400, 'Status must be active, halted or delisted');
    const before = sec.status;
    sec.status = status;
    audit(s, me.user_id, 'security.status', 'securities', null, { ticker, before, after: status });
    return sec;
  });
}

export function set_cron_paused(uid, { paused } = {}) {
  return tx((s) => {
    const me = resolveCaller(s, uid);
    requireRole(me, 'cio');
    s.clock.cron_paused = !!paused;
    audit(s, me.user_id, paused ? 'scheduler.paused' : 'scheduler.resumed', 'job_runs', null, null);
    return s.clock;
  });
}

// ---- scheduled jobs -------------------------------------------------------------

function createPendingPostMortem(s, ticker, date, at) {
  const entry = [...s.pitches].reverse().find((p) => p.ticker === ticker && p.kind === 'entry' && p.status === 'executed');
  if (!entry) return;
  let qty = 0, cost = 0, proceeds = 0, fees = 0;
  for (const f of s.fills) {
    if (f.ticker !== ticker) continue;
    if (qty === 0) cost = proceeds = fees = 0;
    if (f.side === 'buy') { qty += f.qty; cost += f.qty * f.price; } else { qty -= f.qty; proceeds += f.qty * f.price; }
    fees += f.fee || 0;
  }
  const pm = {
    id: uuid(), ticker, analyst_id: entry.analyst_id, entry_pitch_id: entry.id,
    realised_pnl: round2(proceeds - cost - fees), status: 'pending',
    what_happened: null, thesis_verdict: null, lesson: null,
    created_at: at, due_at: addDays(date, 7), filed_at: null,
  };
  s.post_mortems.push(pm);
  audit(s, null, 'post_mortem.created', 'post_mortems', pm.id, { ticker, analyst_id: entry.analyst_id, realised_pnl: pm.realised_pnl }, at);
}

function fillsForSession(s, date) {
  const at = `${date}T14:30:00.000Z`;
  if (!isSession(date)) {
    jobRun(s, 'run_fills', 'skipped', `${date}: market closed`, at);
    return { skipped: true };
  }
  ensureSessions(s, date);
  // Sells first so their proceeds are available to buys at the same open.
  const pending = s.orders.filter((o) => o.status === 'pending_open').sort((a, b) => (a.side === 'sell' ? 0 : 1) - (b.side === 'sell' ? 0 : 1));
  let filled = 0, rejected = 0;
  for (const o of pending) {
    const sec = V.security(s, o.ticker);
    const bar = barOn(s, o.ticker, date);
    const reject = (reason) => {
      o.status = 'rejected';
      o.reject_reason = reason;
      rejected++;
      const pitch = o.pitch_id && s.pitches.find((p) => p.id === o.pitch_id);
      if (pitch?.status === 'executed') {
        pitch.status = 'pm_approved';
        pitch.order_id = null;
      }
      audit(s, null, 'order.rejected', 'orders', o.id, { ticker: o.ticker, reason }, at);
    };
    if (!sec || sec.status !== 'active') { reject(`Security ${sec?.status ?? 'unknown'} at the open`); continue; }
    if (!bar) { reject('No opening price available'); continue; }
    const price = bar[0];
    const gross = o.qty * price;
    const fee = round2((gross * sec.fee_bps) / 10000);
    if (o.side === 'buy' && gross + fee > V.cash(s) + 1e-6) { reject(`Insufficient cash at the actual open (${money(gross + fee)} needed)`); continue; }
    if (o.side === 'sell' && o.qty > (V.positions(s).find((p) => p.ticker === o.ticker)?.qty ?? 0)) { reject('Sell exceeds holding (long-only)'); continue; }

    const fill = { id: uuid(), order_id: o.id, ticker: o.ticker, side: o.side, qty: o.qty, price, fee, filled_at: at, session: date };
    s.fills.push(fill);
    s.cash_ledger.push({ id: uuid(), delta: o.side === 'buy' ? -gross : gross, reason: o.side, ref_id: fill.id, created_at: at });
    if (fee > 0) s.cash_ledger.push({ id: uuid(), delta: -fee, reason: 'fees', ref_id: fill.id, created_at: at });
    o.status = 'filled';
    o.filled_at = at;
    filled++;
    audit(s, null, 'order.filled', 'orders', o.id, { ticker: o.ticker, side: o.side, qty: o.qty, price, fee }, at);
    if (o.side === 'sell' && !V.positions(s).some((p) => p.ticker === o.ticker)) createPendingPostMortem(s, o.ticker, date, at);
  }
  jobRun(s, 'run_fills', 'ok', `${date}: ${filled} filled, ${rejected} rejected`, at);
  return { filled, rejected };
}

function navForSession(s, date) {
  const at = `${date}T20:30:00.000Z`;
  if (!isSession(date)) {
    jobRun(s, 'run_nav', 'skipped', `${date}: market closed`, at);
    return { skipped: true };
  }
  ensureSessions(s, date);
  const prevClose = Object.fromEntries(s.securities.map((x) => [x.ticker, x.last_close]));
  for (const sec of s.securities) {
    const bar = barOn(s, sec.ticker, date);
    if (bar) {
      sec.last_close = bar[1];
      sec.last_close_at = date;
    }
  }

  // Daily position P&L for attribution: change in value net of today's trades and fees.
  const todays = s.fills.filter((f) => f.session === date);
  const pos = V.positions(s);
  const tickers = new Set([...pos.map((p) => p.ticker), ...todays.map((f) => f.ticker)]);
  s.position_pnl_daily = s.position_pnl_daily.filter((r) => r.snap_date !== date);
  for (const t of tickers) {
    const close = V.security(s, t).last_close;
    const qtyNow = pos.find((p) => p.ticker === t)?.qty ?? 0;
    const tf = todays.filter((f) => f.ticker === t);
    const qtyPrev = qtyNow - tf.reduce((q, f) => q + (f.side === 'buy' ? f.qty : -f.qty), 0);
    const flows = tf.reduce((a, f) => a + (f.side === 'buy' ? 1 : -1) * f.qty * f.price, 0);
    const fees = tf.reduce((a, f) => a + (f.fee || 0), 0);
    const buys = tf.filter((f) => f.side === 'buy').reduce((a, f) => a + f.qty * f.price, 0);
    const mvPrev = qtyPrev * (prevClose[t] ?? close);
    s.position_pnl_daily.push({ snap_date: date, ticker: t, pnl: round2(qtyNow * close - mvPrev - flows - fees), base: round2(mvPrev + buys) });
  }

  const benches = new Set([s.fund_config.fund_benchmark, ...s.sleeves.map((x) => x.benchmark)]);
  for (const b of benches) {
    const bar = barOn(s, b, date);
    if (!bar) continue;
    const existing = s.benchmarks.find((x) => x.ticker === b && x.snap_date === date);
    if (existing) existing.close = bar[1];
    else s.benchmarks.push({ ticker: b, snap_date: date, close: bar[1] });
  }

  const rows = V.book(s);
  const cash = V.cash(s);
  const invested = rows.reduce((a, r) => a + r.market_value, 0);
  const snap = { snap_date: date, nav: round2(cash + invested), cash: round2(cash), invested: round2(invested), position_count: rows.length, created_at: at };
  const i = s.nav_snapshots.findIndex((n) => n.snap_date === date);
  if (i >= 0) s.nav_snapshots[i] = snap;
  else s.nav_snapshots.push(snap);

  // TTL sweep: stale theses never reach the IC agenda.
  const cutoff = `${date}T23:59:59.999Z`;
  let expired = 0;
  for (const p of s.pitches) {
    if (['submitted', 'pm_approved'].includes(p.status) && p.expires_at && p.expires_at < cutoff) {
      p.status = 'expired';
      expired++;
      audit(s, null, 'pitch.expired', 'pitches', p.id, { ticker: p.ticker }, at);
    }
  }

  if (!s.clock.date || date > s.clock.date) s.clock.date = date;
  jobRun(s, 'run_nav', 'ok', `${date}: NAV ${money(snap.nav)}, ${rows.length} positions${expired ? `, ${expired} pitches expired` : ''}`, at);
  return snap;
}

export function run_fills(_uid, { secret, date } = {}) {
  requireCron(secret, 'run_fills');
  return tx((s) => fillsForSession(s, date));
}

export function run_nav(_uid, { secret, date } = {}) {
  requireCron(secret, 'run_nav');
  return tx((s) => navForSession(s, date));
}

/** The scheduler: run every weekday cron slot between the last run and `target`. */
export function catchUp(target = lastCompletedSession(), { force = false, onClose } = {}) {
  const s = getState();
  if (s.clock.cron_paused && !force) return 0;
  let d = s.clock.date;
  let sessions = 0;
  while (d < target) {
    d = addDays(d, 1);
    if (isWeekend(d)) continue; // cron fires on weekdays only
    run_fills(null, { secret: CRON_SECRET, date: d });
    run_nav(null, { secret: CRON_SECRET, date: d });
    onClose?.(d);
    if (isSession(d)) sessions++;
  }
  return sessions;
}

/** Demo control: let the CIO run the next session immediately instead of waiting. */
export function advance_session(uid) {
  const me = resolveCaller(getState(), uid);
  requireRole(me, 'cio');
  const date = nextSession(getState().clock.date);
  const fills = run_fills(null, { secret: CRON_SECRET, date });
  const snap = run_nav(null, { secret: CRON_SECRET, date });
  tx((s) => audit(s, me.user_id, 'scheduler.manual_session', 'job_runs', null, { date }));
  return { date, fills, snap };
}

// ---- monthly letter ---------------------------------------------------------------

const VERDICT_TEXT = {
  right_right: 'right thesis, made money',
  right_wrong: 'right thesis, lost money',
  wrong_right: 'wrong thesis, made money',
  wrong_wrong: 'wrong thesis, lost money',
};

function draftLetter(d, s) {
  const pct = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
  const name = (t) => `${V.security(s, t)?.name ?? t} (${t})`;
  const rel = d.benchmark_return_pct == null ? null : d.fund_return_pct - d.benchmark_return_pct;
  const lines = [];
  lines.push(`Dear members, families and friends of the fund,`);
  lines.push('');
  lines.push(
    `The HSC Investment Club mock fund returned ${pct(d.fund_return_pct)} in ${d.label}, ` +
      (rel == null ? '' : `against ${pct(d.benchmark_return_pct)} for ${d.benchmark} — ${rel >= 0 ? 'ahead' : 'behind'} by ${Math.abs(rel).toFixed(2)} percentage points. `) +
      `NAV finished the month at ${money(d.nav_end)}, ${pct(d.since_inception_pct)} since inception, with ${d.position_count} positions and ${d.cash_pct.toFixed(1)}% in cash.`,
  );
  lines.push('');
  if (d.sleeves.length) {
    lines.push(`By sleeve: ${d.sleeves.map((x) => `${x.name} ${x.pnl >= 0 ? 'added' : 'cost'} ${money(Math.abs(x.pnl))}`).join('; ')}.`);
    lines.push('');
  }
  if (d.top.length) lines.push(`Biggest contributors: ${d.top.map((c) => `${name(c.ticker)} ${c.pnl >= 0 ? '+' : '−'}${money(Math.abs(c.pnl))}`).join(', ')}.`);
  if (d.bottom.length) lines.push(`Biggest detractors: ${d.bottom.map((c) => `${name(c.ticker)} −${money(Math.abs(c.pnl))}`).join(', ')}.`);
  lines.push('');
  if (d.opened.length) lines.push(`New positions this month: ${d.opened.map(name).join(', ')}.`);
  if (d.closed.length) lines.push(`Positions closed: ${d.closed.map(name).join(', ')}.`);
  if (d.verdicts.length) {
    lines.push(`Post-mortems filed: ${d.verdicts.map((v) => `${v.ticker} — ${VERDICT_TEXT[v.verdict]}`).join('; ')}. We record the process verdict separately from the outcome because a profitable trade on a broken thesis teaches the wrong lesson.`);
  }
  lines.push('');
  lines.push(`[Analyst: add the IC discussion highlights and what we are watching next month before publishing.]`);
  lines.push('');
  lines.push(`— The HSC Investment Club Investment Committee`);
  return lines.join('\n');
}

export function generate_letter(uid, { secret, month } = {}) {
  return tx((s) => {
    let actor = null;
    if (secret !== CRON_SECRET) {
      const me = resolveCaller(s, uid);
      requireRole(me, 'cio');
      actor = me.user_id;
    }
    const m = month ?? previousMonth(s.clock.date);
    const data = V.letterData(s, m);
    if (!data) throw new ApiError(409, `No NAV history for ${monthLabel(m)}`);
    const existing = s.letters.find((l) => l.month === m);
    if (existing?.status === 'published') throw new ApiError(409, `The ${data.label} letter is already published`);
    const at = stamp(s);
    // Production: one Claude Sonnet call turns `data` into prose in the fund's voice.
    // The demo uses a deterministic template so it runs without an API key.
    const letter = {
      id: existing?.id ?? uuid(),
      month: m,
      title: `${data.label} Letter to Members`,
      body: draftLetter(data, s),
      data,
      status: 'draft',
      generated_at: at,
      generated_by: actor,
      edited_by: null,
      edited_at: null,
      published_at: null,
      published_by: null,
    };
    if (existing) Object.assign(existing, letter);
    else s.letters.push(letter);
    jobRun(s, 'generate_letter', 'ok', `${data.label} draft generated`, at);
    audit(s, actor, 'letter.generated', 'letters', letter.id, { month: m }, at);
    return letter;
  });
}

export const FUNCTIONS = {
  execute_pitch,
  shelve_pitch,
  close_position,
  quick_trade,
  cancel_order,
  manage_member,
  reset_demo_data,
  reset_member_password,
  create_member,
  set_security_status,
  set_cron_paused,
  run_fills,
  run_nav,
  advance_session,
  generate_letter,
};
