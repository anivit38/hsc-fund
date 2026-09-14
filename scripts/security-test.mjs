// Seeds an in-memory database, runs the permission attack suite and a full
// pitch → approve → execute → fill → NAV cycle. Exit code 1 on any failure.
//   npm run test:security

import { getState } from '../src/server/store.js';
import { seedDatabase } from '../src/server/seed.js';
import { runSecurityTests } from '../src/server/securityTests.js';
import { createClient } from '../src/server/client.js';
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

console.log(`\n${failures ? `${failures} FAILED` : 'All checks passed'}`);
process.exit(failures ? 1 : 0);
