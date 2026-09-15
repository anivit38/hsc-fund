import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable, useView } from '../hooks.js';
import { api } from '../api.js';
import { ASSET_CLASS_LABEL } from '../format.js';

const emptyForm = {
  kind: 'entry', ticker: '', thesis: '', catalyst: '', falsifier: '',
  price_target: '', stop_price: '', horizon_months: 12, conviction: 3, suggested_wt_pct: '',
};

export default function NewPitch() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const securities = useTable('securities');
  const pending = useView('pending_post_mortem', { user_id: profile.user_id });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(null);

  // Every member can pitch any asset class in the fund's universe — sleeves
  // are just a reporting label the server derives from the ticker, not a
  // restriction on who can pitch what.
  const byClass = useMemo(() => {
    const groups = new Map();
    for (const s of securities.data || []) {
      if (s.status !== 'active') continue;
      const list = groups.get(s.asset_class) || [];
      list.push(s);
      groups.set(s.asset_class, list);
    }
    for (const list of groups.values()) list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return [...groups.entries()].sort((a, b) => (ASSET_CLASS_LABEL[a[0]] || a[0]).localeCompare(ASSET_CLASS_LABEL[b[0]] || b[0]));
  }, [securities.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const side = form.kind === 'entry' || form.kind === 'add' ? 'buy' : 'sell';

  const blocked = pending.data;

  const payload = () => ({
    analyst_id: profile.user_id,
    kind: form.kind,
    ticker: form.ticker,
    side,
    thesis: form.thesis,
    catalyst: form.catalyst || null,
    falsifier: form.falsifier,
    price_target: form.price_target || null,
    stop_price: form.stop_price || null,
    horizon_months: form.horizon_months || null,
    conviction: form.conviction || null,
    suggested_wt_pct: form.suggested_wt_pct || null,
  });

  const saveDraft = async () => {
    setBusy(true);
    setErr(null);
    try {
      setSaved(await api.insert('pitches', payload()));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitNow = async () => {
    setBusy(true);
    setErr(null);
    try {
      const row = saved || (await api.insert('pitches', payload()));
      await api.update('pitches', row.id, { status: 'submitted' });
      navigate(`/pitches/${row.id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="New Pitch">
      {blocked && (
        <div className="banner banner-warn">
          You have an overdue post-mortem on <strong>{blocked.ticker}</strong>. File it before starting a new pitch. <a href="/post-mortems">Go file it →</a>
        </div>
      )}
      {saved && !err && <div className="banner banner-info">Saved as a draft. You can keep editing, or submit it for PM review.</div>}
      {err && <div className="banner banner-error">{err}</div>}

      <div className="card card-pad" style={{ maxWidth: 640, opacity: blocked ? 0.5 : 1, pointerEvents: blocked ? 'none' : 'auto' }}>
        <div className="grid grid-2">
          <div className="field">
            <label className="required">Kind</label>
            <select value={form.kind} onChange={set('kind')}>
              <option value="entry">Entry (new position)</option>
              <option value="add">Add (increase position)</option>
              <option value="trim">Trim (reduce position)</option>
              <option value="exit">Exit (close position)</option>
            </select>
          </div>
          <div className="field">
            <label className="required">Ticker — any asset class</label>
            <select value={form.ticker} onChange={set('ticker')}>
              <option value="">Select…</option>
              {byClass.map(([cls, list]) => (
                <optgroup key={cls} label={ASSET_CLASS_LABEL[cls] || cls}>
                  {list.map((s) => (
                    <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="required">Thesis</label>
          <textarea value={form.thesis} onChange={set('thesis')} placeholder="What's the case, in plain terms?" />
        </div>
        <div className="field">
          <label>Catalyst</label>
          <textarea value={form.catalyst} onChange={set('catalyst')} placeholder="What event or data point plays this out?" />
        </div>
        <div className="field">
          <label className="required">Falsifier — what would make you wrong?</label>
          <textarea value={form.falsifier} onChange={set('falsifier')} placeholder="Be specific and measurable." />
          <div className="hint">This is the highest-leverage field in the whole pitch. No falsifier, no submission.</div>
        </div>

        <div className="grid grid-3">
          <div className="field">
            <label className="required">Price target</label>
            <input type="number" value={form.price_target} onChange={set('price_target')} />
          </div>
          <div className="field">
            <label className="required">Stop price</label>
            <input type="number" value={form.stop_price} onChange={set('stop_price')} />
          </div>
          <div className="field">
            <label>Horizon (months)</label>
            <input type="number" value={form.horizon_months} onChange={set('horizon_months')} />
          </div>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>Conviction (1–5)</label>
            <input type="number" min="1" max="5" value={form.conviction} onChange={set('conviction')} />
          </div>
          <div className="field">
            <label className="required">Suggested weight (% of NAV)</label>
            <input type="number" step="0.5" value={form.suggested_wt_pct} onChange={set('suggested_wt_pct')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy || !form.ticker || !form.thesis} onClick={saveDraft}>Save draft</button>
          <button className="btn btn-primary" disabled={busy || !form.ticker || !form.thesis || !form.falsifier} onClick={submitNow}>
            Save &amp; submit for review
          </button>
        </div>
      </div>
    </Layout>
  );
}
