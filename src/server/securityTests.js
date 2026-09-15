// Attack scenarios from the spec ("Assume someone will try"). Each one runs as a
// real member through the same client the app uses, inside a rollback so nothing
// a test does is kept.

import { getState, withRollback } from './store.js';
import { createClient } from './client.js';

const pitchBy = (ticker, status) => getState().pitches.find((p) => p.ticker === ticker && (!status || p.status === status));

export const SECURITY_TESTS = [
  {
    id: 'orders-insert', as: 'u-mia', expect: 'blocked', area: 'Execution tables',
    title: 'Analyst inserts an order directly',
    run: (c) => c.insert('orders', { ticker: 'NVDA', side: 'buy', qty: 1000, ref_price: 1, created_by: c.uid }),
  },
  {
    id: 'cash-insert', as: 'u-mia', expect: 'blocked', area: 'Execution tables',
    title: 'Analyst credits $1,000,000 to the cash ledger',
    run: (c) => c.insert('cash_ledger', { delta: 1_000_000, reason: 'inception' }),
  },
  {
    id: 'fills-update', as: 'u-priya', expect: 'blocked', area: 'Execution tables',
    title: 'PM rewrites a fill price',
    run: (c) => c.update('fills', getState().fills[0]?.id, { price: 0.01 }),
  },
  {
    id: 'nav-insert', as: 'u-alex', expect: 'blocked', area: 'Execution tables',
    title: 'Even the CIO cannot write NAV snapshots from the client',
    run: (c) => c.insert('nav_snapshots', { snap_date: '2099-01-01', nav: 5_000_000, cash: 0, invested: 0, position_count: 0 }),
  },
  {
    id: 'audit-delete', as: 'u-alex', expect: 'blocked', area: 'Execution tables',
    title: 'CIO deletes an audit log row',
    run: (c) => c.remove('audit_log', 1),
  },
  {
    id: 'role-escalation', as: 'u-mia', expect: 'blocked', area: 'Profiles',
    title: 'Analyst updates own profile to role = cio',
    run: (c) => c.update('profiles', c.uid, { role: 'cio' }),
  },
  {
    id: 'sleeve-hop', as: 'u-ethan', expect: 'blocked', area: 'Profiles',
    title: 'Analyst moves self into another sleeve',
    run: (c) => c.update('profiles', c.uid, { sleeve_id: 'sl-alt' }),
  },
  {
    id: 'other-profile', as: 'u-zara', expect: 'blocked', area: 'Profiles',
    title: "Analyst edits someone else's profile",
    run: (c) => c.update('profiles', 'u-alex', { full_name: 'Hacked' }),
  },
  {
    id: 'rename-self', as: 'u-zara', expect: 'allowed', area: 'Profiles',
    title: 'Analyst corrects the spelling of own name',
    run: (c) => c.update('profiles', c.uid, { full_name: 'Zara Ahmed' }),
  },
  {
    id: 'exec-analyst', as: 'u-mia', expect: 'blocked', area: 'Edge Functions',
    title: 'Analyst calls execute_pitch',
    run: (c) => c.invoke('execute_pitch', { pitch_id: pitchBy('LQD', 'pm_approved')?.id }),
  },
  {
    id: 'exec-body-role', as: 'u-noah', expect: 'blocked', area: 'Edge Functions',
    title: 'PM calls execute_pitch with { role: "cio" } in the body',
    run: (c) => c.invoke('execute_pitch', { pitch_id: pitchBy('LQD', 'pm_approved')?.id, role: 'cio', user_id: 'u-alex' }),
  },
  {
    id: 'quick-trade-analyst', as: 'u-mia', expect: 'blocked', area: 'Edge Functions',
    title: 'Analyst calls quick_trade directly',
    run: (c) => c.invoke('quick_trade', { ticker: 'JNJ', side: 'buy', target_wt_pct: 4 }),
  },
  {
    id: 'quick-trade-pm', as: 'u-priya', expect: 'blocked', area: 'Edge Functions',
    title: 'PM calls quick_trade directly',
    run: (c) => c.invoke('quick_trade', { ticker: 'JNJ', side: 'buy', target_wt_pct: 4 }),
  },
  {
    id: 'cron-no-secret', as: 'u-alex', expect: 'blocked', area: 'Edge Functions',
    title: 'Signed-in CIO triggers run_fills without the cron secret',
    run: (c) => c.invoke('run_fills', { date: getState().clock.date }),
  },
  {
    id: 'manage-roles-pm', as: 'u-priya', expect: 'blocked', area: 'Edge Functions',
    title: 'PM promotes a friend to PM via manage_member',
    run: (c) => c.invoke('manage_member', { user_id: 'u-mia', role: 'pm', sleeve_id: 'sl-eq' }),
  },
  {
    id: 'advisor-state', as: 'u-carter', expect: 'blocked', area: 'Edge Functions',
    title: 'Advisor cancels a pending order',
    run: (c) => c.invoke('cancel_order', { order_id: getState().orders.find((o) => o.status === 'pending_open')?.id ?? 'none' }),
  },
  {
    id: 'pm-self-approve', as: 'u-priya', expect: 'blocked', area: 'Pitches',
    title: 'PM approves their own pitch',
    run: (c) => c.update('pitches', pitchBy('QQQ', 'submitted').id, { status: 'pm_approved', pm_user_id: c.uid, pm_wt_pct: 5, pm_note: 'LGTM' }),
  },
  {
    id: 'pm-cross-sleeve-approve', as: 'u-noah', expect: 'allowed', area: 'Pitches',
    title: "PM approves a pitch outside their own sleeve (sleeves don't gate this)",
    run: (c) => c.update('pitches', pitchBy('AMZN', 'submitted').id, { status: 'pm_approved', pm_user_id: c.uid, pm_wt_pct: 5, pm_note: 'ok' }),
  },
  {
    id: 'analyst-self-approve', as: 'u-mia', expect: 'blocked', area: 'Pitches',
    title: 'Analyst marks own draft as pm_approved',
    run: (c) => c.update('pitches', pitchBy('WOW.AX', 'draft').id, { status: 'pm_approved', pm_user_id: 'u-priya', pm_wt_pct: 5, pm_note: 'approved' }),
  },
  {
    id: 'edit-submitted', as: 'u-mia', expect: 'blocked', area: 'Pitches',
    title: 'Analyst rewrites the thesis after submitting',
    run: (c) => c.update('pitches', pitchBy('AMZN', 'submitted').id, { thesis: 'Different thesis now that the price moved' }),
  },
  {
    id: 'pm-rewrite-thesis', as: 'u-priya', expect: 'blocked', area: 'Pitches',
    title: "PM edits the analyst's thesis while approving",
    run: (c) => c.update('pitches', pitchBy('AMZN', 'submitted').id, { status: 'pm_approved', pm_user_id: c.uid, pm_wt_pct: 5, pm_note: 'ok', thesis: 'PM thesis' }),
  },
  {
    id: 'pm-impersonate', as: 'u-priya', expect: 'blocked', area: 'Pitches',
    title: 'PM stamps a decision as made by a different PM',
    run: (c) => c.update('pitches', pitchBy('AMZN', 'submitted').id, { status: 'pm_approved', pm_user_id: 'u-liam', pm_wt_pct: 5, pm_note: 'ok' }),
  },
  {
    id: 'pm-approve-ok', as: 'u-priya', expect: 'allowed', area: 'Pitches',
    title: "PM approves an analyst's pitch in own sleeve",
    run: (c) => c.update('pitches', pitchBy('AMZN', 'submitted').id, { status: 'pm_approved', pm_user_id: c.uid, pm_wt_pct: 5, pm_note: 'Approved for IC' }),
  },
  {
    id: 'pitch-any-asset-class', as: 'u-mia', expect: 'allowed', area: 'Pitches',
    title: 'Any analyst can pitch any asset class (sleeves are a label, not a boundary)',
    run: (c) => c.insert('pitches', { analyst_id: c.uid, ticker: 'RE-BONDI', side: 'buy', kind: 'entry', thesis: 'x', falsifier: 'y' }),
  },
  {
    id: 'pitch-as-other', as: 'u-mia', expect: 'blocked', area: 'Pitches',
    title: 'Analyst creates a pitch under a classmate’s name',
    run: (c) => c.insert('pitches', { analyst_id: 'u-ethan', sleeve_id: 'sl-eq', ticker: 'JNJ', side: 'buy', kind: 'entry', thesis: 'x', falsifier: 'y' }),
  },
  {
    id: 'pitch-born-approved', as: 'u-mia', expect: 'blocked', area: 'Pitches',
    title: 'Analyst inserts a pitch that starts as pm_approved',
    run: (c) => c.insert('pitches', { analyst_id: c.uid, sleeve_id: 'sl-eq', ticker: 'JNJ', side: 'buy', kind: 'entry', status: 'pm_approved', thesis: 'x', falsifier: 'y', pm_wt_pct: 8 }),
  },
  {
    id: 'advisor-pitch', as: 'u-carter', expect: 'blocked', area: 'Pitches',
    title: 'Advisor submits a pitch',
    run: (c) => c.insert('pitches', { analyst_id: c.uid, sleeve_id: null, ticker: 'JNJ', side: 'buy', kind: 'entry', thesis: 'x', falsifier: 'y' }),
  },
  {
    id: 'blocked-by-postmortem', as: 'u-ethan', expect: 'blocked', area: 'Post-mortems',
    title: 'Analyst with an overdue post-mortem starts a new pitch',
    run: (c) => c.insert('pitches', { analyst_id: c.uid, sleeve_id: 'sl-eq', ticker: 'JNJ', side: 'buy', kind: 'entry', thesis: 'Defensive pharma', falsifier: 'Talc liability' }),
  },
  {
    id: 'postmortem-others', as: 'u-mia', expect: 'blocked', area: 'Post-mortems',
    title: "Analyst files a classmate's post-mortem for them",
    run: (c) => c.update('post_mortems', getState().post_mortems.find((p) => p.status === 'pending')?.id, { status: 'filed', what_happened: 'x', lesson: 'y', thesis_verdict: 'right_right' }),
  },
  {
    id: 'advisor-comment', as: 'u-carter', expect: 'allowed', area: 'Comments',
    title: 'Advisor comments on a pitch',
    run: (c) => c.insert('pitch_comments', { pitch_id: pitchBy('AMZN').id, author_id: c.uid, body: 'Good question from the PM.' }),
  },
  {
    id: 'comment-impersonate', as: 'u-mia', expect: 'blocked', area: 'Comments',
    title: 'Analyst posts a comment as the CIO',
    run: (c) => c.insert('pitch_comments', { pitch_id: pitchBy('AMZN').id, author_id: 'u-alex', body: 'Approved, execute it.' }),
  },
  {
    id: 'read-audit', as: 'u-mia', expect: 'hidden', area: 'Reads',
    title: 'Analyst reads the audit log',
    run: (c) => c.select('audit_log'),
  },
  {
    id: 'read-drafts', as: 'u-ethan', expect: 'hidden', area: 'Reads',
    title: "Analyst reads a classmate's unsubmitted draft",
    run: (c) => c.select('pitches').filter((p) => p.status === 'draft' && p.analyst_id !== c.uid),
  },
];

/** Run every scenario and report whether the platform behaved as expected. */
export function runSecurityTests() {
  return SECURITY_TESTS.map((t) =>
    withRollback(() => {
      const client = createClient(t.as);
      let outcome, message;
      try {
        const result = t.run(client);
        if (t.expect === 'hidden') {
          outcome = Array.isArray(result) && result.length === 0 ? 'hidden' : 'visible';
          message = outcome === 'hidden' ? 'Row-level security returned 0 rows' : `${result.length} rows returned`;
        } else {
          outcome = 'allowed';
          message = 'Write accepted';
        }
      } catch (e) {
        outcome = 'blocked';
        message = `${e.status ?? ''} ${e.message}`.trim();
      }
      return { ...t, run: undefined, outcome, message, pass: outcome === t.expect };
    }),
  );
}
