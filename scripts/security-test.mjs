// Seeds an in-memory database, runs the permission attack suite and a full
// pitch → approve → execute → fill → NAV cycle. Exit code 1 on any failure.
//   npm run test:security

import { getState } from '../src/server/store.js';
import { seedDatabase } from '../src/server/seed.js';
import { runSecurityTests } from '../src/server/securityTests.js';
import { createClient } from '../src/server/client.js';
import { signup } from '../src/server/auth.js';
import * as V from '../src/server/views.js';

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`);
  if (!ok) failures++;
};

const t0 = Date.now();
seedDatabase();
const s = getState();
console.log(`Seeded ${s.sessions.length} sessions to ${s.clock.date} in ${Date.now() - t0}ms`);
const sum = V.summary(s);
console.log(`NAV $${Math.round(sum.nav).toLocaleString()} · ${sum.position_count} positions · cash ${sum.cash_pct.toFixed(1)}% · SPY ${sum.benchmark_return_pct.toFixed(2)}%`);
console.log(`Pending post-mortems: ${s.post_mortems.filter((p) => p.status === 'pending').map((p) => p.ticker).join(', ')}; letters: ${s.letters.map((l) => `${l.month}:${l.status}`).join(', ')}`);
console.log('');

console.log('— Security suite —');
for (const r of runSecurityTests()) check(`[${r.as}] ${r.title}`, r.pass, `expected ${r.expect}, got ${r.outcome}: ${r.message}`);

console.log('\n— Signup —');
const cioSignup = signup({ full_name: 'Auto CIO', email: '039443@hsc.on.ca', password: 'testpass1' });
check('Reserved address auto-provisions as CIO, pre-approved', cioSignup.profile.role === 'cio' && cioSignup.profile.approved === true);
const analystSignup = signup({ full_name: 'Random Person', email: 'whoever@anything.xyz', password: 'testpass1' });
check('Any other email signs up as analyst, unapproved, no sleeve', analystSignup.profile.role === 'analyst' && analystSignup.profile.approved === false && analystSignup.profile.sleeve_id === null);
let dupe = false;
try { signup({ full_name: 'Dup', email: 'whoever@anything.xyz', password: 'testpass1' }); } catch { dupe = true; }
check('Duplicate email is rejected', dupe);

const pending = createClient(analystSignup.profile.user_id);
check('Unapproved account holds a valid token but sees nothing (RLS, not just UI)', pending.select('pitches').length === 0 && pending.select('securities').length === 0);
let pendingBlocked = false;
try { pending.invoke('execute_pitch', { pitch_id: 'anything' }); } catch (e) { pendingBlocked = e.status === 403; }
check('Unapproved account cannot invoke any Edge Function', pendingBlocked);
let pendingWriteBlocked = false;
try { pending.insert('pitches', { analyst_id: analystSignup.profile.user_id, ticker: 'JNJ', side: 'buy', kind: 'entry', thesis: 'x', falsifier: 'y' }); } catch { pendingWriteBlocked = true; }
check('Unapproved account cannot even draft a pitch', pendingWriteBlocked);
const approvedNow = createClient('u-alex').invoke('manage_member', { user_id: analystSignup.profile.user_id, approved: true });
check('CIO approves the pending account', approvedNow.approved === true);
check('Now-approved account can read the book', pending.select('securities').length > 0);

console.log('\n— Lifecycle —');
const mia = createClient('u-mia');
const priya = createClient('u-priya');
const alex = createClient('u-alex');

const draft = mia.insert('pitches', { analyst_id: 'u-mia', sleeve_id: 'sl-eq', ticker: 'JNJ', side: 'buy', kind: 'entry', thesis: 'Defensive compounder', falsifier: '' });
check('Analyst saves a draft', draft.status === 'draft');
let blocked = false;
try { mia.update('pitches', draft.id, { status: 'submitted' }); } catch { blocked = true; }
check('Submission without falsifier/target/stop is rejected by the database', blocked);
const sub = mia.update('pitches', draft.id, { status: 'submitted', falsifier: 'Talc liability over $15bn', price_target: 180, stop_price: 140, suggested_wt_pct: 5 });
check('Complete pitch submits and server stamps expiry', sub.status === 'submitted' && !!sub.expires_at);
const appr = priya.update('pitches', draft.id, { status: 'pm_approved', pm_user_id: 'u-priya', pm_wt_pct: 5, pm_note: 'Approved' });
check('PM approves with weight and note', appr.status === 'pm_approved' && !!appr.pm_decided_at);
const pv = alex.view('preview_trade', { ticker: 'JNJ', side: 'buy', kind: 'entry', target_wt_pct: 5 });
console.log('      preview:', pv.qty, 'shares, breaches:', pv.breaches.map((b) => b.label).join('; ') || 'none');
let res;
try {
  res = alex.invoke('execute_pitch', { pitch_id: draft.id });
} catch (e) {
  res = alex.invoke('execute_pitch', { pitch_id: draft.id, risk_override: true, override_note: 'Test override' });
}
check('CIO executes → pending_open order', res.order.status === 'pending_open');
const ibit = getState().pitches.find((p) => p.ticker === 'IBIT');
let breach;
try { alex.invoke('execute_pitch', { pitch_id: ibit.id }); } catch (e) { breach = e; }
check('IBIT at 6% fails the 5% digital-asset limit without override', breach?.status === 422, breach?.message);
const adv = alex.invoke('advance_session');
const order = getState().orders.find((o) => o.id === res.order.id);
check(`Next session (${adv.date}) fills the order at the open`, order.status === 'filled');
check('Book shows the new position', V.book(getState()).some((r) => r.ticker === 'JNJ'));
check('NAV snapshot written for the new session', getState().nav_snapshots.at(-1).snap_date === adv.date);

// mia is historically tagged sl-eq, but sleeves no longer gate anything — she
// should be able to pitch a commodity just as freely as an equity.
const crossClass = mia.insert('pitches', { analyst_id: 'u-mia', ticker: 'DBA', side: 'buy', kind: 'entry', thesis: 'Agriculture diversifier', falsifier: 'x' });
check('Analyst can pitch outside their historical sleeve/asset class', crossClass.sleeve_id === 'sl-alt');
let crossApprove;
try {
  crossApprove = getState().profiles.find((p) => p.user_id === 'u-liam'); // PM of Real Estate, not Alternatives
  const liam = createClient('u-liam');
  const submitted = mia.update('pitches', crossClass.id, { status: 'submitted', falsifier: 'Grain prices fall 20%', price_target: 30, stop_price: 22, suggested_wt_pct: 4 });
  crossApprove = liam.update('pitches', submitted.id, { status: 'pm_approved', pm_user_id: 'u-liam', pm_wt_pct: 4, pm_note: 'Approved cross-sleeve' });
} catch (e) {
  crossApprove = { error: e.message };
}
check("A PM from a different sleeve can approve it (sleeves don't gate decisions)", crossApprove?.status === 'pm_approved', crossApprove?.error);

console.log(`\n${failures ? `${failures} FAILED` : 'All checks passed'}`);
process.exit(failures ? 1 : 0);
