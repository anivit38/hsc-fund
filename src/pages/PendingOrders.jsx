import { useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useTable } from '../hooks.js';
import { StatusBadge } from '../components/Badge.jsx';
import { api } from '../api.js';
import { money, dateTime, ASSET_CLASS_LABEL } from '../format.js';

function QuickTrade({ onDone }) {
  const { data: securities } = useTable('securities');
  const [ticker, setTicker] = useState('');
  const [side, setSide] = useState('buy');
  const [mode, setMode] = useState('weight'); // 'weight' | 'qty'
  const [wt, setWt] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const byClass = useMemo(() => {
    const groups = new Map();
    for (const s of securities || []) {
      if (s.status !== 'active') continue;
      const list = groups.get(s.asset_class) || [];
      list.push(s);
      groups.set(s.asset_class, list);
    }
    for (const list of groups.values()) list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return [...groups.entries()].sort((a, b) => (ASSET_CLASS_LABEL[a[0]] || a[0]).localeCompare(ASSET_CLASS_LABEL[b[0]] || b[0]));
  }, [securities]);

  const sec = securities?.find((s) => s.ticker === ticker);

  const args = () => ({
    ticker, side,
    target_wt_pct: mode === 'weight' ? Number(wt) : undefined,
    qty: mode === 'qty' ? Number(qty) : undefined,
  });

  const loadPreview = async () => {
    setErr(null);
    setPreview(null);
    try {
      const pv = await api.view('preview_trade', { ...args(), kind: side === 'buy' ? 'entry' : 'trim' });
      setPreview(pv);
    } catch (e) {
      setErr(e.message);
    }
  };

  const execute = async (override) => {
    setBusy(true);
    setErr(null);
    try {
      await api.invoke('quick_trade', { ...args(), note, risk_override: !!override, override_note: override ? overrideNote : undefined });
      setTicker(''); setWt(''); setQty(''); setNote(''); setOverrideNote(''); setPreview(null);
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const canPreview = ticker && ((mode === 'weight' && wt) || (mode === 'qty' && qty));

  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17 }}>Quick Trade</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 16 }}>
        Trade any ticker directly — outside the pitch process, still through the same risk engine and next-open fill.
      </p>
      <div className="grid grid-3">
        <div className="field">
          <label className="required">Ticker</label>
          <select value={ticker} onChange={(e) => { setTicker(e.target.value); setPreview(null); }}>
            <option value="">Select…</option>
            {byClass.map(([cls, list]) => (
              <optgroup key={cls} label={ASSET_CLASS_LABEL[cls] || cls}>
                {list.map((s) => <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>)}
              </optgroup>
            ))}
          </select>
          {sec && <div className="hint">Last close {money(sec.last_close, 2)} · {sec.unit}</div>}
        </div>
        <div className="field">
          <label>Side</label>
          <select value={side} onChange={(e) => { setSide(e.target.value); setPreview(null); }}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div className="field">
          <label>Size by</label>
          <select value={mode} onChange={(e) => { setMode(e.target.value); setPreview(null); }}>
            <option value="weight">Target weight (% of NAV)</option>
            <option value="qty">Exact quantity</option>
          </select>
        </div>
      </div>
      <div className="grid grid-2">
        {mode === 'weight' ? (
          <div className="field">
            <label className="required">Target weight (%)</label>
            <input type="number" step="0.5" value={wt} onChange={(e) => { setWt(e.target.value); setPreview(null); }} />
          </div>
        ) : (
          <div className="field">
            <label className="required">Quantity</label>
            <input type="number" step="1" value={qty} onChange={(e) => { setQty(e.target.value); setPreview(null); }} />
          </div>
        )}
        <div className="field">
          <label>Note (optional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this trade, in one line" />
        </div>
      </div>

      <button className="btn btn-sm" disabled={!canPreview} onClick={loadPreview} style={{ marginBottom: 10 }}>Preview risk checks</button>
      {err && <div className="banner banner-error">{err}</div>}
      {preview && (
        <div style={{ marginBottom: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>{preview.qty.toLocaleString()} units at ~{money(preview.price, 2)} · fee {money(preview.fee, 2)}</p>
          {preview.checks.map((c) => (
            <div className="checklist-item" key={c.key}>
              <span className={`icon ${c.ok ? 'ok' : 'fail'}`}>{c.ok ? '✓' : '!'}</span>
              <span>{c.label}</span>
              <span className="checklist-detail">{c.detail}</span>
            </div>
          ))}
          {preview.breaches.length > 0 && (
            <div className="field" style={{ marginTop: 10 }}>
              <label className="required">Override note (required to proceed past a breach)</label>
              <textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
            </div>
          )}
          <button className="btn btn-primary" disabled={busy || preview.hard_breaches.length > 0} onClick={() => execute(preview.breaches.length > 0)}>
            {preview.breaches.length > 0 ? 'Execute with override' : `Execute ${side}`}
          </button>
        </div>
      )}
    </div>
  );
}

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
    <Layout title="Control Center" subtitle="Trade any ticker directly, and track every order the fund has placed — pending, filled, cancelled or rejected.">
      {err && <div className="banner banner-error">{err}</div>}
      <QuickTrade onDone={reload} />
      <div className="card">
        <div className="card-header"><h2>Orders</h2></div>
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
                    {!o.pitch_id && <span className="badge badge-purple" style={{ marginRight: 6 }}>quick trade</span>}
                    {o.risk_override && <span className="badge badge-amber" style={{ marginRight: 6 }}>override</span>}
                    {o.force_exit && <span className="badge badge-red" style={{ marginRight: 6 }}>force-exit</span>}
                    {o.note || o.override_note || o.reject_reason || ''}
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
