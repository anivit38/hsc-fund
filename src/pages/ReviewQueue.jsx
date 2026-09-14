import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable } from '../hooks.js';
import { KindBadge } from '../components/Badge.jsx';
import { date } from '../format.js';

export default function ReviewQueue() {
  const { profile } = useAuth();
  const { data: pitches, loading } = useTable('pitches');
  const { data: profiles } = useTable('profiles');
  const nameOf = (uid) => profiles?.find((p) => p.user_id === uid)?.full_name || uid;

  const queue = (pitches || [])
    .filter((p) => p.sleeve_id === profile.sleeve_id && p.status === 'submitted' && p.analyst_id !== profile.user_id)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  return (
    <Layout title="Review Queue">
      <p className="muted" style={{ marginBottom: 16 }}>Submitted pitches in your sleeve, excluding your own.</p>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ticker</th><th>Kind</th><th>Analyst</th><th className="num">Conviction</th><th>Suggested wt.</th><th>Submitted</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {!loading && queue.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                  <td><KindBadge kind={p.kind} /></td>
                  <td>{nameOf(p.analyst_id)}</td>
                  <td className="num mono">{p.conviction ?? '—'}/5</td>
                  <td>{p.suggested_wt_pct ? `${p.suggested_wt_pct}%` : '—'}</td>
                  <td className="muted">{date(p.submitted_at)}</td>
                  <td className="muted">{date(p.expires_at)}</td>
                  <td><Link to={`/pitches/${p.id}`}>Review →</Link></td>
                </tr>
              ))}
              {!loading && !queue.length && <tr><td colSpan={8} className="empty">Nothing waiting on you right now.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
