import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useTable } from '../hooks.js';
import { api } from '../api.js';
import { date } from '../format.js';

export default function ICAgenda() {
  const { data: pitches, loading, reload } = useTable('pitches');
  const { data: profiles } = useTable('profiles');
  const nameOf = (uid) => profiles?.find((p) => p.user_id === uid)?.full_name || uid;
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const agenda = (pitches || []).filter((p) => p.status === 'pm_approved').sort((a, b) => new Date(a.pm_decided_at) - new Date(b.pm_decided_at));

  const advance = async () => {
    setBusy('advance');
    setErr(null);
    try {
      const res = await api.invoke('advance_session');
      await reload();
      alert(`Session ${res.date} run: ${res.fills.filled ?? 0} fills, ${res.fills.rejected ?? 0} rejected.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout
      title="To Approve"
      actions={<button className="btn btn-sm" disabled={busy} onClick={advance}>Advance to next session (demo)</button>}
    >
      {err && <div className="banner banner-error">{err}</div>}
      <p className="muted" style={{ marginBottom: 16 }}>PM-approved pitches ready for the Investment Committee to execute or pass on.</p>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ticker</th><th>Kind</th><th>Analyst</th><th>PM</th><th>Target weight</th><th>Approved</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {!loading && agenda.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                  <td>{p.kind}</td>
                  <td>{nameOf(p.analyst_id)}</td>
                  <td>{nameOf(p.pm_user_id)}</td>
                  <td>{p.pm_wt_pct}%</td>
                  <td className="muted">{date(p.pm_decided_at)}</td>
                  <td className="muted">{date(p.expires_at)}</td>
                  <td><Link to={`/pitches/${p.id}`}>Decide →</Link></td>
                </tr>
              ))}
              {!loading && !agenda.length && <tr><td colSpan={8} className="empty">Nothing on the agenda right now.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
