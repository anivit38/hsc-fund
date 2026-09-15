import Layout from '../components/Layout.jsx';
import { useTable } from '../hooks.js';
import { dateTime } from '../format.js';

export default function AuditLog() {
  const { data: rows, loading } = useTable('audit_log');
  const { data: profiles } = useTable('profiles');
  const nameOf = (uid) => (uid ? profiles?.find((p) => p.user_id === uid)?.full_name || uid : 'System (cron)');

  const sorted = [...(rows || [])].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <Layout title="History">
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
            <tbody>
              {!loading && sorted.slice(0, 300).map((r) => (
                <tr key={r.id}>
                  <td className="muted">{dateTime(r.at)}</td>
                  <td>{nameOf(r.actor_id)}</td>
                  <td><span className="badge badge-purple">{r.action}</span></td>
                  <td className="muted">{r.entity}</td>
                  <td className="muted" style={{ maxWidth: 420, fontSize: 12 }}>{r.payload ? JSON.stringify(r.payload) : ''}</td>
                </tr>
              ))}
              {!loading && !sorted.length && <tr><td colSpan={5} className="empty">Nothing logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
