import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable } from '../hooks.js';
import { api } from '../api.js';
import { date } from '../format.js';

export default function Letters() {
  const { profile } = useAuth();
  const { data: letters, loading, reload } = useTable('letters');
  const [open, setOpen] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const canEdit = profile.role === 'analyst' || profile.role === 'cio';
  const sorted = [...(letters || [])].sort((a, b) => b.month.localeCompare(a.month));
  const active = sorted.find((l) => l.id === open);

  const startEdit = (l) => { setOpen(l.id); setBody(l.body); };

  const save = () =>
    run(() => api.update('letters', active.id, { title: active.title, body, status: active.status }));
  const publish = () =>
    run(() => api.update('letters', active.id, { title: active.title, body, status: 'published' }));
  const generate = () =>
    run(async () => {
      await api.invoke('generate_letter', {});
    });

  async function run(fn) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await reload();
      setOpen(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Letters to Members" actions={profile.role === 'cio' && <button className="btn btn-sm" disabled={busy} onClick={generate}>Generate this month's letter</button>}>
      {err && <div className="banner banner-error">{err}</div>}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header"><h2>Archive</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {!loading && sorted.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 700 }}>{l.title}</td>
                    <td><span className={`badge badge-${l.status === 'published' ? 'green' : 'gray'}`}>{l.status}</span></td>
                    <td><button className="btn btn-sm" onClick={() => startEdit(l)}>Open</button></td>
                  </tr>
                ))}
                {!loading && !sorted.length && <tr><td colSpan={3} className="empty">No letters yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {active && (
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>{active.title}</h3>
            {canEdit && active.status === 'draft' ? (
              <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 360, fontFamily: 'inherit' }} />
            ) : (
              <div className="thesis-block">{active.body}</div>
            )}
            {canEdit && active.status === 'draft' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" disabled={busy} onClick={save}>Save draft</button>
                <button className="btn btn-primary" disabled={busy} onClick={publish}>Publish</button>
              </div>
            )}
            {active.published_at && <p className="muted" style={{ fontSize: 12 }}>Published {date(active.published_at)}</p>}
          </div>
        )}
      </div>
    </Layout>
  );
}
