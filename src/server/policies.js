// Row-level security. This mirrors supabase/migrations/0001_schema.sql policy for
// policy. Semantics follow Postgres: an UPDATE is allowed when ANY policy's USING
// matches the existing row AND ANY policy's WITH CHECK accepts the new row — which
// is why every WITH CHECK below repeats its own role/sleeve conditions instead of
// relying on its USING clause.

import { tx, uuid } from './store.js';
import { ApiError, rlsError, noRowsError, constraintError } from './errors.js';
import { security, pendingPostMortem } from './views.js';
import { stamp } from './clock.js';

// Tables with deliberately no INSERT / UPDATE / DELETE policy. Only Edge Functions
// running as service role can write them.
const SERVICE_ONLY = new Set([
  'orders', 'fills', 'cash_ledger', 'nav_snapshots', 'audit_log', 'job_runs',
  'benchmarks', 'securities', 'fund_config', 'sleeves', 'position_pnl_daily',
]);

const MEMBER_READABLE = new Set([
  'profiles', 'sleeves', 'securities', 'fund_config', 'orders', 'fills', 'cash_ledger',
  'nav_snapshots', 'benchmarks', 'post_mortems', 'job_runs', 'position_pnl_daily',
]);

const PITCH_CONTENT = ['kind', 'sleeve_id', 'ticker', 'side', 'thesis', 'catalyst', 'falsifier', 'price_target', 'stop_price', 'horizon_months', 'conviction', 'suggested_wt_pct'];
const PITCH_PM = ['pm_user_id', 'pm_note', 'pm_wt_pct', 'pm_decided_at'];
const PITCH_NUMERIC = ['price_target', 'stop_price', 'horizon_months', 'conviction', 'suggested_wt_pct', 'pm_wt_pct'];
const KINDS = ['entry', 'add', 'trim', 'exit'];
const VERDICTS = ['right_right', 'right_wrong', 'wrong_right', 'wrong_wrong'];

// ---- auth helpers (auth_role(), auth_sleeve(), is_member()) -------------------

export const profileOf = (s, uid) => (uid ? s.profiles.find((p) => p.user_id === uid) : null);
const authRole = (s, uid) => profileOf(s, uid)?.role ?? null;
const isMember = (s, uid) => !!profileOf(s, uid)?.active;

const blank = (v) => v == null || String(v).trim() === '';
const same = (a, b, cols) => cols.every((c) => (a[c] ?? null) === (b[c] ?? null));

// ---- SELECT -------------------------------------------------------------------

function canSeePitch(s, uid, p) {
  return isMember(s, uid) && (p.status !== 'draft' || p.analyst_id === uid);
}

export function select(s, uid, table) {
  if (!isMember(s, uid)) return [];
  const role = authRole(s, uid);
  switch (table) {
    case 'pitches':
      return s.pitches.filter((p) => canSeePitch(s, uid, p));
    case 'pitch_comments': {
      const visible = new Set(s.pitches.filter((p) => canSeePitch(s, uid, p)).map((p) => p.id));
      return s.pitch_comments.filter((c) => visible.has(c.pitch_id));
    }
    case 'audit_log':
      return role === 'cio' || role === 'advisor' ? s.audit_log : [];
    case 'letters':
      return s.letters.filter((l) => l.status === 'published' || role !== 'advisor');
    default:
      if (MEMBER_READABLE.has(table)) return Array.isArray(s[table]) ? s[table] : [s[table]];
      return [];
  }
}

// ---- constraints and triggers (table-level, apply to every writer) --------------

function normalizePitch(row) {
  const out = { ...row };
  for (const c of PITCH_NUMERIC) {
    if (c in out) out[c] = blank(out[c]) ? null : Number(out[c]);
  }
  for (const c of ['thesis', 'catalyst', 'falsifier', 'pm_note']) {
    if (typeof out[c] === 'string') out[c] = out[c].trim();
  }
  return out;
}

// Sleeves are a reporting label, not an access boundary: everyone can pitch or
// approve any asset class (restrictions are by role and by the fund's risk
// limits, not by which sleeve someone happens to be tagged with — see
// functions.js's risk engine for the actual limits). A pitch's sleeve_id is
// therefore always derived from its ticker, never taken from — or checked
// against — the analyst's or PM's own profile.
export function sleeveForAssetClass(s, assetClass) {
  return s.sleeves.find((sl) => sl.asset_classes.includes(assetClass)) ?? null;
}

function checkPitchConstraints(s, p) {
  const cfg = s.fund_config;
  if (!KINDS.includes(p.kind)) throw constraintError(`invalid input value for enum pitch_kind: "${p.kind}"`);
  if (p.thesis == null) throw constraintError('null value in column "thesis" violates not-null constraint');
  if (p.falsifier == null) throw constraintError('null value in column "falsifier" violates not-null constraint');
  const sec = security(s, p.ticker);
  if (!sec) throw constraintError(`insert or update on "pitches" violates foreign key: ticker "${p.ticker}" not in securities`);
  const sleeve = s.sleeves.find((x) => x.id === p.sleeve_id);
  if (!sleeve) throw constraintError('sleeve_id does not reference a sleeve');
  if (!sleeve.asset_classes.includes(sec.asset_class)) {
    throw constraintError(`${p.ticker} is ${sec.asset_class.replace('_', ' ')}, which is outside the ${sleeve.name} sleeve`);
  }
  const expectedSide = p.kind === 'entry' || p.kind === 'add' ? 'buy' : 'sell';
  if (p.side !== expectedSide) throw constraintError(`a ${p.kind} pitch must be a ${expectedSide} (long-only fund)`);
  if (p.conviction != null && (p.conviction < 1 || p.conviction > 5)) throw constraintError('conviction must be between 1 and 5');

  if (p.status !== 'draft') {
    const missing = [];
    if (blank(p.thesis)) missing.push('thesis');
    if (blank(p.falsifier)) missing.push('falsifier');
    if (p.price_target == null) missing.push('price target');
    if (p.stop_price == null) missing.push('stop price');
    if (p.kind !== 'exit' && p.suggested_wt_pct == null) missing.push('suggested weight');
    if (missing.length) throw constraintError(`A submitted pitch requires: ${missing.join(', ')}`);
  }
  if (p.status === 'pm_approved') {
    if (p.kind === 'exit') {
      p.pm_wt_pct = 0;
    } else if (p.pm_wt_pct == null || p.pm_wt_pct < cfg.min_position_pct || p.pm_wt_pct > cfg.max_position_pct) {
      throw constraintError(`Approved target weight must be between ${cfg.min_position_pct}% and ${cfg.max_position_pct}%`);
    }
  }
  if (['pm_approved', 'pm_rejected'].includes(p.status) && blank(p.pm_note)) {
    throw constraintError('A PM decision requires a note');
  }
}

// ---- INSERT -------------------------------------------------------------------

export function insert(uid, table, input) {
  return tx((s) => {
    if (SERVICE_ONLY.has(table)) throw rlsError(table);
    const me = profileOf(s, uid);
    const at = stamp(s);

    if (table === 'pitches') {
      const sec = security(s, input.ticker);
      const row = normalizePitch({
        kind: 'entry', status: 'draft', catalyst: null, price_target: null, stop_price: null,
        horizon_months: null, conviction: null, suggested_wt_pct: null, pm_user_id: null,
        pm_note: null, pm_wt_pct: null, pm_decided_at: null, order_id: null, ...input,
        // sleeve_id is always derived from the ticker, never from the analyst's
        // own profile or whatever the client sent — see sleeveForAssetClass().
        sleeve_id: sec ? sleeveForAssetClass(s, sec.asset_class)?.id ?? null : input.sleeve_id,
      });
      checkPitchConstraints(s, row);
      // pitch_insert: own row, starts as draft, no overdue post-mortem. Any
      // active analyst or PM can pitch any asset class — see sleeveForAssetClass.
      const ok =
        isMember(s, uid) &&
        !['advisor'].includes(authRole(s, uid)) &&
        row.analyst_id === uid &&
        row.status === 'draft' &&
        PITCH_PM.every((c) => row[c] == null) &&
        row.order_id == null &&
        !pendingPostMortem(s, uid);
      if (!ok) throw rlsError(table);
      const created = { ...row, id: uuid(), created_at: at, submitted_at: null, expires_at: null };
      s.pitches.push(created);
      return created;
    }

    if (table === 'pitch_comments') {
      const pitch = s.pitches.find((p) => p.id === input.pitch_id);
      const body = String(input.body ?? '').trim();
      if (!body) throw constraintError('null value in column "body" violates not-null constraint');
      const ok = isMember(s, uid) && input.author_id === uid && pitch && canSeePitch(s, uid, pitch);
      if (!ok) throw rlsError(table);
      const created = { id: uuid(), pitch_id: input.pitch_id, author_id: uid, body, created_at: at };
      s.pitch_comments.push(created);
      return created;
    }

    // profiles, post_mortems, letters: rows are created by admins or triggers only.
    void me;
    throw rlsError(table);
  });
}

// ---- UPDATE -------------------------------------------------------------------

export function update(uid, table, id, patch) {
  return tx((s) => {
    if (SERVICE_ONLY.has(table)) throw noRowsError(table);
    const me = profileOf(s, uid);
    const at = stamp(s);
    const role = me?.role;

    if (table === 'pitches') {
      const old = s.pitches.find((p) => p.id === id);
      if (!old || !canSeePitch(s, uid, old)) throw noRowsError(table);
      const next = normalizePitch({ ...old, ...patch, id: old.id, created_at: old.created_at });
      // sleeve_id always tracks the ticker, not whoever is editing/deciding it —
      // re-derive rather than trust the patch (see sleeveForAssetClass above).
      const sec = security(s, next.ticker);
      next.sleeve_id = sec ? sleeveForAssetClass(s, sec.asset_class)?.id ?? next.sleeve_id : next.sleeve_id;

      const authorUsing = old.analyst_id === uid && old.status === 'draft';
      // Any PM may decide on any submitted pitch — sleeves don't gate this —
      // except their own (see analyst_id !== uid below): no self-approval.
      const pmUsing = role === 'pm' && old.status === 'submitted' && old.analyst_id !== uid;
      if (!isMember(s, uid) || (!authorUsing && !pmUsing)) throw noRowsError(table);

      // BEFORE UPDATE trigger: the server stamps lifecycle timestamps, not the client.
      if (old.status === 'draft' && next.status === 'submitted') {
        next.submitted_at = at;
        next.expires_at = new Date(new Date(at).getTime() + s.fund_config.pitch_ttl_days * 86400000).toISOString();
      } else {
        next.submitted_at = old.submitted_at;
        next.expires_at = old.expires_at;
      }
      next.pm_decided_at = old.status === 'submitted' && next.status !== 'submitted' ? at : old.pm_decided_at;
      checkPitchConstraints(s, next);

      const authorCheck =
        next.analyst_id === uid &&
        ['draft', 'submitted'].includes(next.status) &&
        same(old, next, [...PITCH_PM, 'order_id']) &&
        (next.status === 'draft' || !pendingPostMortem(s, uid));
      const pmCheck =
        role === 'pm' &&
        next.analyst_id !== uid &&
        ['pm_approved', 'pm_rejected'].includes(next.status) &&
        next.pm_user_id === uid &&
        same(old, next, [...PITCH_CONTENT, 'analyst_id', 'order_id']);
      if (!authorCheck && !pmCheck) throw rlsError(table);

      Object.assign(old, next);
      return old;
    }

    if (table === 'profiles') {
      const old = s.profiles.find((p) => p.user_id === id);
      if (!old || old.user_id !== uid || !isMember(s, uid)) throw noRowsError(table);
      const next = { ...old, ...patch };
      // profile_self_update WITH CHECK pins identity, role, sleeve and active flag.
      const ok = next.user_id === uid && next.role === old.role && (next.sleeve_id ?? null) === (old.sleeve_id ?? null) && next.active === old.active;
      if (!ok) throw rlsError(table);
      if (blank(next.full_name)) throw constraintError('full_name cannot be empty');
      Object.assign(old, { full_name: next.full_name.trim() });
      return old;
    }

    if (table === 'post_mortems') {
      const old = s.post_mortems.find((p) => p.id === id);
      if (!old || old.analyst_id !== uid || old.status !== 'pending' || !isMember(s, uid)) throw noRowsError(table);
      const next = { ...old, ...patch };
      const ok = next.analyst_id === uid && next.status === 'filed' && same(old, next, ['ticker', 'entry_pitch_id', 'realised_pnl', 'created_at']);
      if (!ok) throw rlsError(table);
      if (blank(next.what_happened) || blank(next.lesson)) throw constraintError('what_happened and lesson are required');
      if (!VERDICTS.includes(next.thesis_verdict)) throw constraintError('thesis_verdict must be one of right_right, right_wrong, wrong_right, wrong_wrong');
      Object.assign(old, {
        status: 'filed',
        what_happened: next.what_happened.trim(),
        thesis_verdict: next.thesis_verdict,
        lesson: next.lesson.trim(),
        filed_at: at,
      });
      return old;
    }

    if (table === 'letters') {
      const old = s.letters.find((l) => l.id === id);
      const editor = role === 'analyst' || role === 'cio';
      if (!old || !editor || old.status !== 'draft' || !isMember(s, uid)) throw noRowsError(table);
      const next = { ...old, ...patch };
      if (!['draft', 'published'].includes(next.status) || !same(old, next, ['id', 'month', 'generated_at'])) throw rlsError(table);
      Object.assign(old, {
        title: String(next.title ?? old.title),
        body: String(next.body ?? old.body),
        status: next.status,
        edited_by: uid,
        edited_at: at,
        published_at: next.status === 'published' ? at : null,
        published_by: next.status === 'published' ? uid : null,
      });
      return old;
    }

    throw noRowsError(table);
  });
}

// ---- DELETE -------------------------------------------------------------------

export function remove(uid, table) {
  // No table has a DELETE policy. Audit rows in particular are append-only.
  throw new ApiError(403, `0 rows deleted: no DELETE policy exists on "${table}"`, { rls: true, uid });
}

export { canSeePitch };
