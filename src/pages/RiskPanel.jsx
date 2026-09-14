import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useTable, useView } from '../hooks.js';
import BarBreakdown from '../components/BarBreakdown.jsx';
import { api } from '../api.js';
import { pctAbs, money, ASSET_CLASS_LABEL } from '../format.js';

export default function RiskPanel() {
  const exposures = useView('exposures');
  const { data: config, reload: reloadConfig } = useTable('fund_config');
  const { data: securities, reload: reloadSec } = useTable('securities');
  const [ticker, setTicker] = useState('');
  const [action, setAction] = useState('halted');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const cfg = Array.isArray(config) ? config[0] : config;
  const positions = exposures.data?.positions || [];

  const closeTicker = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.invoke('close_position', { ticker, note });
      setTicker(''); setNote('');
      exposures.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.invoke('set_security_status', { ticker, status: action });
      await reloadSec();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Risk Panel">
      {err && <div className="banner banner-error">{err}</div>}
      <div className="grid grid-2">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h2>Position weights</h2><span className="muted">limit {cfg?.min_position_pct}–{cfg?.max_position_pct}%</span></div>
            <div className="card-pad">
              <BarBreakdown rows={positions.map((p) => ({ key: p.ticker, label: p.ticker, pct: p.weight_pct, value: p.market_value }))} limitPct={cfg?.max_position_pct} />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h2>Sector exposure</h2><span className="muted">limit {cfg?.max_sector_pct}%</span></div>
            <div className="card-pad">
              <BarBreakdown rows={exposures.data?.by_sector.map((r) => ({ key: r.key, label: r.label, pct: r.pct, value: r.value }))} limitPct={cfg?.max_sector_pct} />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h2>Asset-class exposure</h2></div>
            <div className="card-pad">
              {exposures.data?.by_asset_class.map((r) => (
                <div key={r.key} style={{ marginBottom: 10 }}>
                  <BarBreakdown rows={[{ key: r.key, label: `${ASSET_CLASS_LABEL[r.key] || r.key}`, pct: r.pct, value: r.value }]} limitPct={cfg?.asset_class_limits?.[r.key]} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Force-exit a position</h3>
            <div className="field">
              <label>Ticker</label>
              <select value={ticker} onChange={(e) => setTicker(e.target.value)}>
                <option value="">Select…</option>
                {positions.map((p) => <option key={p.ticker} value={p.ticker}>{p.ticker} ({pctAbs(p.weight_pct)})</option>)}
              </select>
            </div>
            <div className="field">
              <label className="required">Note (recorded as a risk override)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Stop breached, thesis broken, etc." />
            </div>
            <button className="btn btn-danger" disabled={busy || !ticker || !note.trim()} onClick={closeTicker}>Force-exit</button>
          </div>

          <div className="card card-pad">
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Security status</h3>
            <div className="field">
              <label>Ticker</label>
              <select value={ticker} onChange={(e) => setTicker(e.target.value)}>
                <option value="">Select…</option>
                {(securities || []).map((s) => <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.status}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Set status</label>
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="active">Active</option>
                <option value="halted">Halted</option>
                <option value="delisted">Delisted</option>
              </select>
            </div>
            <button className="btn" disabled={busy || !ticker} onClick={setStatus}>Update status</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
