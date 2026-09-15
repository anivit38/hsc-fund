import { useAuth } from '../AuthContext.jsx';

export default function PendingApproval() {
  const { profile, logout } = useAuth();

  return (
    <div className="login-shell">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="login-brand" style={{ marginBottom: 22 }}>
          <div className="brand-badge">H</div>
          <div className="fund">HSC <span>Endowment</span></div>
        </div>
        <div style={{ fontSize: 34, marginBottom: 6 }}>⏳</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>You're almost in, {profile?.full_name?.split(' ')[0]}</h2>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Your account has been created but hasn't been approved by the CIO yet. Ask them to approve <strong>{profile?.email}</strong> from the Members screen — this page will update as soon as they do.
        </p>
        <button className="btn" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
          Check again
        </button>
        <div style={{ marginTop: 10 }}>
          <button className="signout" style={{ color: 'var(--ink-muted)' }} onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
