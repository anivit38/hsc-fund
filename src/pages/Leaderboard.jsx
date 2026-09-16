import Layout from '../components/Layout.jsx';
import CountUp from '../components/CountUp.jsx';
import { SkeletonTable } from '../components/Skeleton.jsx';
import { useTable, useView } from '../hooks.js';
import { pctAbs } from '../format.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { data: rows, loading } = useView('leaderboard');
  const { data: profiles } = useTable('profiles');
  const nameOf = (uid) => profiles?.find((p) => p.user_id === uid)?.full_name || uid;
  const roleOf = (uid) => profiles?.find((p) => p.user_id === uid)?.role;

  const sorted = [...(rows || [])].filter((r) => r.pitches > 0 || r.pnl !== 0).sort((a, b) => b.pnl - a.pnl);
  const top3 = sorted.slice(0, 3);

  return (
    <Layout title="Leaderboard" subtitle="Who has contributed the most P&L, submitted the most pitches, and gotten the most approved.">
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
        <>
          {top3.length > 0 && (
            <div className="grid grid-3" style={{ marginBottom: 16 }}>
              {top3.map((r, i) => (
                <div className="card stat-tile" key={r.user_id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28 }}>{MEDAL[i]}</div>
                  <div className="value" style={{ fontSize: 18, marginTop: 4 }}>{nameOf(r.user_id)}</div>
                  <div className={`delta ${r.pnl >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 15, marginTop: 6 }}>
                    $<CountUp value={Math.round(r.pnl)} />
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{roleOf(r.user_id)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Rank</th><th>Analyst</th><th className="num">P&amp;L attributed</th><th className="num">Pitches</th><th className="num">Approval rate</th><th className="num">Thesis hit rate</th></tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.user_id}>
                      <td className="mono">{MEDAL[i] || i + 1}</td>
                      <td style={{ fontWeight: 700 }}>{nameOf(r.user_id)} <span className="badge badge-gray" style={{ marginLeft: 6 }}>{roleOf(r.user_id)}</span></td>
                      <td className={`num mono ${r.pnl >= 0 ? 'pos' : 'neg'}`}>$<CountUp value={Math.round(r.pnl)} /></td>
                      <td className="num mono">{r.pitches}</td>
                      <td className="num mono">{r.approval_rate != null ? pctAbs(r.approval_rate) : '—'}</td>
                      <td className="num mono">{r.thesis_hit_rate != null ? pctAbs(r.thesis_hit_rate) : '—'}</td>
                    </tr>
                  ))}
                  {!sorted.length && <tr><td colSpan={6} className="empty">No activity yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
