import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useTable } from '../hooks.js';
import { StatusBadge, KindBadge } from '../components/Badge.jsx';
import { date } from '../format.js';

export default function PitchArchive() {
  const { data: pitches, loading } = useTable('pitches');
  const { data: profiles } = useTable('profiles');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const nameOf = (id) => profiles?.find((p) => p.user_id === id)?.full_name || id;

  const rows = useMemo(() => {
    if (!pitches) return [];
    let r = pitches;
    if (status !== 'all') r = r.filter((p) => p.status === status);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      r = r.filter((p) => `${p.ticker} ${p.thesis} ${nameOf(p.analyst_id)}`.toLowerCase().includes(needle));
    }
    return [...r].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitches, q, status, profiles]);

  return (
    <Layout title="All Pitches">
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Search ticker, thesis, analyst…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
              <option value="all">All statuses</option>
              {['draft', 'submitted', 'pm_approved', 'pm_rejected', 'executed', 'shelved', 'expired'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <span className="muted">{rows.length} pitches</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ticker</th><th>Kind</th><th>Analyst</th><th>Status</th><th className="num">Conviction</th><th>Created</th></tr>
            </thead>
            <tbody>
              {!loading && rows.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/pitches/${p.id}`} style={{ fontWeight: 700 }}>{p.ticker}</Link></td>
                  <td><KindBadge kind={p.kind} /></td>
                  <td>{nameOf(p.analyst_id)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="num mono">{p.conviction ?? '—'}/5</td>
                  <td className="muted">{date(p.created_at)}</td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan={6} className="empty">No pitches match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
