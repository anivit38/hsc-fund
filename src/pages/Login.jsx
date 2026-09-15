import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';

export default function Login() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [sleeveId, setSleeveId] = useState('');
  const [sleeves, setSleeves] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.publicSleeves().then(setSleeves).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await signup(fullName, email, password, sleeveId || null);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="discover">DISCOVER</div>
          <div className="fund">HSC Fund</div>
          <div className="sub">Investment Club mock fund</div>
        </div>

        <div className="tabs" style={{ marginBottom: 18 }}>
          <button type="button" className={`tab${mode === 'signin' ? ' active' : ''}`} onClick={() => { setMode('signin'); setError(null); }}>
            Sign in
          </button>
          <button type="button" className={`tab${mode === 'signup' ? ' active' : ''}`} onClick={() => { setMode('signup'); setError(null); }}>
            Create account
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="field">
              <label className="required">Full name</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jamie Rivera" autoFocus />
            </div>
          )}
          <div className="field">
            <label className="required">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus={mode === 'signin'} />
          </div>
          <div className="field">
            <label className="required">Password</label>
            <input
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {mode === 'signup' && <div className="hint">At least 8 characters.</div>}
          </div>
          {mode === 'signup' && (
            <div className="field">
              <label>Which sleeve do you want to join?</label>
              <select value={sleeveId} onChange={(e) => setSleeveId(e.target.value)}>
                <option value="">Not sure yet — I'll ask the CIO</option>
                {sleeves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="hint">You'll join as an Analyst. A Portfolio Manager or CIO can change your role or sleeve later.</div>
            </div>
          )}
          {error && <div className="banner banner-error">{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} type="submit">
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {mode === 'signin' && (
          <p className="field hint" style={{ marginTop: 16, textAlign: 'center' }}>
            New here? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setError(null); }}>Create an account</a>.
          </p>
        )}
      </div>
    </div>
  );
}
