import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

import Login from './pages/Login.jsx';
import PendingApproval from './pages/PendingApproval.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Book from './pages/Book.jsx';
import PitchArchive from './pages/PitchArchive.jsx';
import PitchDetail from './pages/PitchDetail.jsx';
import NewPitch from './pages/NewPitch.jsx';
import MyPitches from './pages/MyPitches.jsx';
import PostMortems from './pages/PostMortems.jsx';
import ReviewQueue from './pages/ReviewQueue.jsx';
import SleeveDashboard from './pages/SleeveDashboard.jsx';
import ICAgenda from './pages/ICAgenda.jsx';
import PendingOrders from './pages/PendingOrders.jsx';
import RiskPanel from './pages/RiskPanel.jsx';
import Members from './pages/Members.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Letters from './pages/Letters.jsx';
import Account from './pages/Account.jsx';
import Guide from './pages/Guide.jsx';

function Guard({ roles, children }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  // Approved is the real gate (enforced server-side too) — an unapproved
  // account can hold a valid session but sees only the pending screen.
  if (profile.approved === false) return <Navigate to="/pending" replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { profile, loading } = useAuth();

  const homeFor = (p) => (p ? (p.approved === false ? '/pending' : '/') : '/login');

  return (
    <Routes>
      <Route path="/login" element={profile ? <Navigate to={homeFor(profile)} replace /> : <Login />} />
      <Route
        path="/pending"
        element={!profile ? <Navigate to="/login" replace /> : profile.approved === false ? <PendingApproval /> : <Navigate to="/" replace />}
      />
      <Route path="/" element={<Guard><Dashboard /></Guard>} />
      <Route path="/book" element={<Guard><Book /></Guard>} />
      <Route path="/pitches" element={<Guard><PitchArchive /></Guard>} />
      <Route path="/pitches/:id" element={<Guard><PitchDetail /></Guard>} />
      <Route path="/leaderboard" element={<Guard><Leaderboard /></Guard>} />
      <Route path="/letters" element={<Guard><Letters /></Guard>} />
      <Route path="/account" element={<Guard><Account /></Guard>} />
      <Route path="/guide" element={<Guard><Guide /></Guard>} />

      <Route path="/new-pitch" element={<Guard roles={['analyst']}><NewPitch /></Guard>} />
      <Route path="/my-pitches" element={<Guard roles={['analyst']}><MyPitches /></Guard>} />
      <Route path="/post-mortems" element={<Guard roles={['analyst']}><PostMortems /></Guard>} />

      <Route path="/review-queue" element={<Guard roles={['pm']}><ReviewQueue /></Guard>} />
      <Route path="/sleeve" element={<Guard roles={['pm']}><SleeveDashboard /></Guard>} />

      <Route path="/ic-agenda" element={<Guard roles={['cio']}><ICAgenda /></Guard>} />
      <Route path="/orders" element={<Guard roles={['cio']}><PendingOrders /></Guard>} />
      <Route path="/risk" element={<Guard roles={['cio']}><RiskPanel /></Guard>} />
      <Route path="/members" element={<Guard roles={['cio']}><Members /></Guard>} />
      <Route path="/audit" element={<Guard roles={['cio', 'advisor']}><AuditLog /></Guard>} />

      <Route path="*" element={<Navigate to={loading ? '/login' : homeFor(profile)} replace />} />
    </Routes>
  );
}
