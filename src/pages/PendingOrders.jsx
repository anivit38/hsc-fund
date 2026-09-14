import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useTable } from '../hooks.js';
import { StatusBadge } from '../components/Badge.jsx';
import { api } from '../api.js';
import { money, dateTime } from '../format.js';

export default function PendingOrders() {
  const { data: orders, loading, reload } = useTable('orders');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const cancel = async (id) => {
    setBusy(id);
    setErr(null);
    try {
      await api.invoke('cancel_order', { order_id: id });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const sorted = [...(orders || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <Layout title="Orders">
      {err && <div className="banner banner-error">{err}</div>}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ticker</th><th>Side</th><th className="num">Qty</th><th className="num">Ref price</th><th>Status</th><th>Notes</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {!loading && sorted.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 700 }}>{o.ticker}</td>
                  <td style={{ textTransform: 'uppercase' }}>{o.side}</td>
                  <td className="num mono">{o.qty.toLocaleString()}</td>
                  <td className="num mono">{money(o.ref_price, 2)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="muted" style={{ maxWidth: 260 }}>
                    {o.risk_override && <span className="badge badge-amber" style={{ marginRight: 6 }}>override</span>}
                    {o.force_exit && <span className="badge badge-red" style={{ marginRight: 6 }}>force-exit</span>}
                    {o.override_note || o.reject_reason || ''}
                  </td>
                  <td className="muted">{dateTime(o.created_at)}</td>
                  <td>
                    {o.status === 'pending_open' && (
                      <button className="btn btn-sm btn-danger" disabled={busy === o.id} onClick={() => cancel(o.id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !sorted.length && <tr><td colSpan={8} className="empty">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
