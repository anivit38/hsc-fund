import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable } from '../hooks.js';
import { StatusBadge, KindBadge } from '../components/Badge.jsx';
import { date } from '../format.js';

export default function MyPitches() {
  const { profile } = useAuth();
  const { data: pitches, loading } = useTable('pitches');
  const mine = (pitches || []).filter((p) => p.analyst_id === profile.user_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <Layout title="My Pitches" actions={<Link className="btn btn-primary btn-sm" to="/new-pitch">+ New pitch</Link>}>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ticker</th><th>Kind</th><th>Status</th><th>Suggested wt.</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {!loading && mine.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                  <td><KindBadge kind={p.kind} /></td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{p.suggested_wt_pct ? `${p.suggested_wt_pct}%` : '—'}</td>
                  <td className="muted">{date(p.created_at)}</td>
                  <td><Link to={`/pitches/${p.id}`}>Open →</Link></td>
                </tr>
              ))}
              {!loading && !mine.length && <tr><td colSpan={6} className="empty">No pitches yet. Start one from New Pitch.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
