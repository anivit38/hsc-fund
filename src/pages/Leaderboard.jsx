import Layout from '../components/Layout.jsx';
import { useTable, useView } from '../hooks.js';
import { money, pctAbs } from '../format.js';

export default function Leaderboard() {
  const { data: rows, loading } = useView('leaderboard');
  const { data: profiles } = useTable('profiles');
  const nameOf = (uid) => profiles?.find((p) => p.user_id === uid)?.full_name || uid;
  const roleOf = (uid) => profiles?.find((p) => p.user_id === uid)?.role;

  const sorted = [...(rows || [])].filter((r) => r.pitches > 0 || r.pnl !== 0).sort((a, b) => b.pnl - a.pnl);

  return (
    <Layout title="Leaderboard">
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Rank</th><th>Analyst</th><th className="num">P&amp;L attributed</th><th className="num">Pitches</th><th className="num">Approval rate</th><th className="num">Thesis hit rate</th></tr>
            </thead>
            <tbody>
              {!loading && sorted.map((r, i) => (
                <tr key={r.user_id}>
                  <td className="mono">{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{nameOf(r.user_id)} <span className="badge badge-gray" style={{ marginLeft: 6 }}>{roleOf(r.user_id)}</span></td>
                  <td className={`num mono ${r.pnl >= 0 ? 'pos' : 'neg'}`}>{money(r.pnl)}</td>
                  <td className="num mono">{r.pitches}</td>
                  <td className="num mono">{r.approval_rate != null ? pctAbs(r.approval_rate) : '—'}</td>
                  <td className="num mono">{r.thesis_hit_rate != null ? pctAbs(r.thesis_hit_rate) : '—'}</td>
                </tr>
              ))}
              {!loading && !sorted.length && <tr><td colSpan={6} className="empty">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
