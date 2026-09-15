import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { getTheme, setTheme } from '../theme.js';
import { api } from '../api.js';

function Item({ to, letter, children }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} title={children}>
      <span className="dot">{letter}</span>
      <span className="nav-link-label">{children}</span>
    </NavLink>
  );
}

function greeting(name) {
  const h = new Date().getHours();
  const time = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${time}${name ? `, ${name}` : ''}`;
}

function ThemeToggle() {
  const [mode, setMode] = useState(getTheme());
  const cycle = () => {
    const next = mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark';
    setMode(next);
    setTheme(next);
  };
  const icon = mode === 'dark' ? '🌙' : mode === 'light' ? '☀️' : '🖥️';
  const label = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'Auto';
  return (
    <button className="pill-status" onClick={cycle} title={`Theme: ${label} (click to change)`} style={{ cursor: 'pointer' }}>
      <span aria-hidden style={{ fontSize: 11 }}>{icon}</span>
      {label}
    </button>
  );
}

function LiveStatusPill() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    api.health().then((h) => alive && setHealth(h)).catch(() => alive && setHealth(false));
    const id = setInterval(() => api.health().then((h) => alive && setHealth(h)).catch(() => {}), 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const state = health === null ? 'stale' : health === false ? 'off' : health.live_market ? 'live' : 'stale';
  const label = health === null ? 'Connecting…' : health === false ? 'Offline' : health.live_market ? 'Live quotes' : 'Simulated only';
  return (
    <span className="pill-status" data-state={state} title="Whether prices are being pulled from the real market right now">
      <b />
      {label}
    </span>
  );
}

export default function Layout({ title, subtitle, actions, children }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <div className="brand-badge">H</div>
          <div className="brand-word">HSC <span>Endowment</span></div>
        </div>
        <div className="topbar-greet">{greeting(profile?.full_name?.split(' ')[0])}</div>
        <div className="topbar-right">
          <LiveStatusPill />
          <ThemeToggle />
          <div className="whoami">
            <b>{profile?.full_name}</b>
            <i>{ROLE_LABEL[role]}</i>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="app-frame">
        <aside className="sidebar">
          <nav>
            <div className="nav-section">
              <div className="nav-label">Fund</div>
              <Item to="/" letter="D">Dashboard</Item>
              <Item to="/book" letter="H">Holdings</Item>
              <Item to="/pitches" letter="A">All Pitches</Item>
              <Item to="/leaderboard" letter="L">Leaderboard</Item>
              <Item to="/letters" letter="✉">Letters</Item>
            </div>

            {role === 'analyst' && (
              <div className="nav-section">
                <div className="nav-label">Pitching</div>
                <Item to="/new-pitch" letter="N">New Pitch</Item>
                <Item to="/my-pitches" letter="M">My Pitches</Item>
                <Item to="/post-mortems" letter="L">Lessons Learned</Item>
              </div>
            )}

            {role === 'pm' && (
              <div className="nav-section">
                <div className="nav-label">Review</div>
                <Item to="/review-queue" letter="R">Review Queue</Item>
                <Item to="/sleeve" letter="S">Sector View</Item>
              </div>
            )}

            {role === 'cio' && (
              <div className="nav-section">
                <div className="nav-label">Committee</div>
                <Item to="/ic-agenda" letter="T">To Approve</Item>
                <Item to="/orders" letter="C">Control Center</Item>
                <Item to="/risk" letter="R">Risk</Item>
                <Item to="/members" letter="M">Members</Item>
                <Item to="/audit" letter="H">History</Item>
              </div>
            )}

            {role === 'advisor' && (
              <div className="nav-section">
                <div className="nav-label">Governance</div>
                <Item to="/audit" letter="H">History</Item>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <NavLink to="/account" className="nav-link" title="Account settings">
              <span className="dot">⚙</span>
              <span className="nav-link-label">Account settings</span>
            </NavLink>
          </div>
        </aside>

        <main className="main">
          <div className="content">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: subtitle ? 6 : 18, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
              {actions && <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>{actions}</div>}
            </div>
            {subtitle && <p className="muted" style={{ fontSize: 13.5, marginBottom: 22, maxWidth: '62ch', lineHeight: 1.6 }}>{subtitle}</p>}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

const ROLE_LABEL = { analyst: 'Analyst', pm: 'Portfolio Manager', cio: 'Chief Investment Officer', advisor: 'Faculty Advisor' };
