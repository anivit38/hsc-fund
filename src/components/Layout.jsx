import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { ROLE_LABEL } from '../format.js';

const ICONS = {
  dashboard: '◧', book: '▤', archive: '⌕', leaderboard: '★',
  newpitch: '✎', mine: '☰', postmortem: '☓',
  review: '☑', sleeve: '◔',
  agenda: '⚑', orders: '⧗', risk: '◎', members: '◉', audit: '☰', letters: '✉',
};

function Item({ to, icon, children }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <span className="dot" />
      <span aria-hidden>{ICONS[icon]}</span>
      <span>{children}</span>
    </NavLink>
  );
}

export default function Layout({ title, actions, children }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="discover">DISCOVER</div>
          <div className="fund">HSC Endowment</div>
          <div className="sub">Investment Club</div>
        </div>

        <nav>
          <div className="nav-section">
            <div className="nav-label">Fund</div>
            <Item to="/" icon="dashboard">Dashboard</Item>
            <Item to="/book" icon="book">Book</Item>
            <Item to="/pitches" icon="archive">Pitch Archive</Item>
            <Item to="/leaderboard" icon="leaderboard">Leaderboard</Item>
            <Item to="/letters" icon="letters">Letters</Item>
          </div>

          {role === 'analyst' && (
            <div className="nav-section">
              <div className="nav-label">Analyst</div>
              <Item to="/new-pitch" icon="newpitch">New Pitch</Item>
              <Item to="/my-pitches" icon="mine">My Pitches</Item>
              <Item to="/post-mortems" icon="postmortem">My Post-Mortems</Item>
            </div>
          )}

          {role === 'pm' && (
            <div className="nav-section">
              <div className="nav-label">Portfolio Manager</div>
              <Item to="/review-queue" icon="review">Review Queue</Item>
              <Item to="/sleeve" icon="sleeve">Sleeve Dashboard</Item>
            </div>
          )}

          {role === 'cio' && (
            <div className="nav-section">
              <div className="nav-label">CIO</div>
              <Item to="/ic-agenda" icon="agenda">IC Agenda</Item>
              <Item to="/orders" icon="orders">Pending Orders</Item>
              <Item to="/risk" icon="risk">Risk Panel</Item>
              <Item to="/members" icon="members">Members</Item>
              <Item to="/audit" icon="audit">Audit Log</Item>
            </div>
          )}

          {(role === 'cio' || role === 'advisor') && (
            <div className="nav-section">
              <div className="nav-label">Governance</div>
              {role === 'advisor' && <Item to="/audit" icon="audit">Audit Log</Item>}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="who">
            <div className="name">{profile?.full_name}</div>
            <div className="role">{ROLE_LABEL[role]}{profile?.grade ? ` · ${profile.grade}` : ''}</div>
          </div>
          <NavLink to="/account" className="nav-link" style={{ fontSize: 12.5 }}>Account settings</NavLink>
          <button className="signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <h1>{title}</h1>
          <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
