import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';

export default function Account() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api.changePassword(current, next);
      setMsg('Password updated.');
      setCurrent(''); setNext('');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Account Settings">
      <div className="card card-pad" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>{profile.full_name}</h3>
        <p className="muted" style={{ fontSize: 12.5 }}>{profile.email} · {profile.role}</p>
        <form onSubmit={submit}>
          <div className="field">
            <label className="required">Current password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label className="required">New password (8+ characters)</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </div>
          {msg && <div className="banner banner-info">{msg}</div>}
          {err && <div className="banner banner-error">{err}</div>}
          <button className="btn btn-primary" disabled={busy} type="submit">Update password</button>
        </form>
      </div>
    </Layout>
  );
}
