import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable } from '../hooks.js';
import { VerdictBadge } from '../components/Badge.jsx';
import { api } from '../api.js';
import { money, date } from '../format.js';

const VERDICTS = [
  ['right_right', 'Right thesis, made money'],
  ['right_wrong', 'Right thesis, lost money'],
  ['wrong_right', 'Wrong thesis, made money (got lucky)'],
  ['wrong_wrong', 'Wrong thesis, lost money'],
];

export default function PostMortems() {
  const { profile } = useAuth();
  const { data: rows, loading, reload } = useTable('post_mortems');
  const mine = (rows || []).filter((p) => p.analyst_id === profile.user_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const pending = mine.find((p) => p.status === 'pending');
  const [what, setWhat] = useState('');
  const [verdict, setVerdict] = useState('');
  const [lesson, setLesson] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const file = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.update('post_mortems', pending.id, { status: 'filed', what_happened: what, thesis_verdict: verdict, lesson });
      setWhat(''); setVerdict(''); setLesson('');
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Lessons Learned">
      {pending && (
        <div className="banner banner-warn">
          A post-mortem for <strong>{pending.ticker}</strong> is overdue — new pitch submissions are blocked until it's filed.
        </div>
      )}
      {pending && (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>{pending.ticker} — realised P&amp;L {money(pending.realised_pnl)}</h3>
          {err && <div className="banner banner-error">{err}</div>}
          <div className="field">
            <label className="required">What happened?</label>
            <textarea value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What actually played out, versus the original thesis?" />
          </div>
          <div className="field">
            <label className="required">Thesis verdict</label>
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="">Select…</option>
              {VERDICTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="required">Lesson</label>
            <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="What will you do differently next time?" />
          </div>
          <button className="btn btn-primary" disabled={busy || !what.trim() || !verdict || !lesson.trim()} onClick={file}>File post-mortem</button>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2>History</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ticker</th><th className="num">Realised P&amp;L</th><th>Verdict</th><th>Lesson</th><th>Filed</th></tr></thead>
            <tbody>
              {!loading && mine.filter((p) => p.status === 'filed').map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                  <td className={`num mono ${p.realised_pnl >= 0 ? 'pos' : 'neg'}`}>{money(p.realised_pnl)}</td>
                  <td><VerdictBadge verdict={p.thesis_verdict} /></td>
                  <td style={{ maxWidth: 320 }}>{p.lesson}</td>
                  <td className="muted">{date(p.filed_at)}</td>
                </tr>
              ))}
              {!loading && !mine.filter((p) => p.status === 'filed').length && <tr><td colSpan={5} className="empty">No post-mortems filed yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
