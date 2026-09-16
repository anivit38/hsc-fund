import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import CountUp from '../components/CountUp.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable } from '../hooks.js';
import { api } from '../api.js';
import { date, dateTime } from '../format.js';

const ROLES = ['analyst', 'pm', 'cio', 'advisor'];
const emptyNew = { full_name: '', email: '', role: 'analyst', sleeve_id: '', grade: '' };

export default function Members() {
  const { profile: me } = useAuth();
  const { data: profiles, loading, reload } = useTable('profiles');
  const { data: sleeves } = useTable('sleeves');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [newMember, setNewMember] = useState(emptyNew);
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const pending = (profiles || []).filter((p) => p.approved === false);
  const roster = (profiles || []).filter((p) => p.approved !== false);
  const hasSeedData = roster.some((p) => p.email?.endsWith('@school.edu.au'));

  const update = async (uid, patch) => {
    setBusy(uid);
    setErr(null);
    try {
      await api.invoke('manage_member', { user_id: uid, ...patch });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy('create');
    setErr(null);
    try {
      await api.invoke('create_member', { ...newMember, sleeve_id: newMember.sleeve_id || null });
      setNewMember(emptyNew);
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const doResetDemo = async () => {
    if (!window.confirm('This permanently removes all 12 demo members and every mock pitch, trade, and post-mortem. Cash resets to $1,000,000. Your own account, fund settings, and the securities universe are kept. This cannot be undone. Continue?')) return;
    setResetting(true);
    setErr(null);
    try {
      const r = await api.invoke('reset_demo_data', {});
      await reload();
      alert(`Done — removed ${r.removed_seed_members} demo members. ${r.members_remaining} member(s) remain.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setResetting(false);
    }
  };

  const doReset = async () => {
    setBusy('reset');
    setErr(null);
    try {
      await api.invoke('reset_member_password', { user_id: resetFor, new_password: newPassword });
      setResetFor(null); setNewPassword('');
      alert('Password reset. Tell the member their new password directly.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const byRole = (r) => roster.filter((p) => p.role === r).length;

  return (
    <Layout title="Members">
      {err && <div className="banner banner-error">{err}</div>}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat-tile">
          <div className="label">Members</div>
          <div className="value"><CountUp value={roster.length} /></div>
          <div className="delta muted">{pending.length ? `${pending.length} awaiting approval` : 'all approved'}</div>
        </div>
        <div className="card stat-tile">
          <div className="label">Analysts</div>
          <div className="value"><CountUp value={byRole('analyst')} /></div>
        </div>
        <div className="card stat-tile">
          <div className="label">PMs</div>
          <div className="value"><CountUp value={byRole('pm')} /></div>
        </div>
        <div className="card stat-tile">
          <div className="label">CIO / Advisor</div>
          <div className="value"><CountUp value={byRole('cio') + byRole('advisor')} /></div>
        </div>
      </div>

      {hasSeedData && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--loss)' }}>
          <h3 style={{ marginTop: 0, fontSize: 14, color: 'var(--loss)' }}>⚠ Remove demo data</h3>
          <p className="muted" style={{ fontSize: 12.5 }}>
            The 12 example members (Alex Chen, Priya Sharma, etc.) and every mock pitch, trade, and
            post-mortem are still in the fund. This clears all of it in one go — cash resets to $1,000,000,
            the NAV chart resets to a flat starting line — and keeps your own account, fund settings, and
            the tradable universe exactly as they are. There's no undo.
          </p>
          <button className="btn btn-danger" disabled={resetting} onClick={doResetDemo}>
            {resetting ? 'Removing…' : 'Remove all demo data'}
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--gold-500)' }}>
          <div className="card-header">
            <h2>⏳ Awaiting approval ({pending.length})</h2>
            <span className="muted">Self-signups can't see or do anything until approved</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Signed up</th><th></th></tr></thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.user_id}>
                    <td style={{ fontWeight: 700 }}>{p.full_name}</td>
                    <td className="muted">{p.email}</td>
                    <td className="muted">{dateTime(p.created_at)}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-green" disabled={busy === p.user_id} onClick={() => update(p.user_id, { approved: true })}>Approve</button>
                      <button className="btn btn-sm btn-danger" disabled={busy === p.user_id} onClick={() => update(p.user_id, { active: false })}>Decline</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Sleeve</th><th>Grade</th><th>Status</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {!loading && roster.map((p) => {
                const isSelf = p.user_id === me?.user_id;
                return (
                <tr key={p.user_id}>
                  <td style={{ fontWeight: 700 }}>{p.full_name}{isSelf && <span className="badge badge-purple" style={{ marginLeft: 6 }}>you</span>}</td>
                  <td className="muted">{p.email}</td>
                  <td>
                    <select value={p.role} disabled={busy === p.user_id || isSelf} title={isSelf ? "You can't change your own role" : undefined} onChange={(e) => update(p.user_id, { role: e.target.value })} style={{ width: 130 }}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={p.sleeve_id || ''}
                      disabled={busy === p.user_id || (p.role !== 'pm' && p.role !== 'analyst')}
                      onChange={(e) => update(p.user_id, { sleeve_id: e.target.value })}
                      style={{ width: 160 }}
                    >
                      <option value="">—</option>
                      {sleeves?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="muted">{p.grade || '—'}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${p.active ? '' : 'btn-danger'}`}
                      disabled={busy === p.user_id || isSelf}
                      title={isSelf ? "You can't deactivate your own account — ask another CIO" : undefined}
                      onClick={() => update(p.user_id, { active: !p.active })}
                    >
                      {p.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="muted">{date(p.created_at)}</td>
                  <td><button className="btn btn-sm" onClick={() => setResetFor(p.user_id)}>Reset password</button></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {resetFor && (
        <div className="card card-pad" style={{ maxWidth: 420, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Reset password for {profiles.find((p) => p.user_id === resetFor)?.full_name}</h3>
          <div className="field">
            <label className="required">New password (8+ characters)</label>
            <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || newPassword.length < 8} onClick={doReset}>Set password</button>
            <button className="btn" onClick={() => setResetFor(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Add a member</h3>
        <p className="muted" style={{ fontSize: 12 }}>Members can also create their own account from the sign-in screen — use this form to add someone directly instead, or to set their role/sleeve up front.</p>
        <div className="grid grid-2">
          <div className="field"><label className="required">Full name</label><input value={newMember.full_name} onChange={(e) => setNewMember((m) => ({ ...m, full_name: e.target.value }))} /></div>
          <div className="field"><label className="required">Email</label><input type="email" value={newMember.email} onChange={(e) => setNewMember((m) => ({ ...m, email: e.target.value }))} /></div>
          <div className="field">
            <label>Role</label>
            <select value={newMember.role} onChange={(e) => setNewMember((m) => ({ ...m, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sleeve</label>
            <select value={newMember.sleeve_id} onChange={(e) => setNewMember((m) => ({ ...m, sleeve_id: e.target.value }))}>
              <option value="">—</option>
              {sleeves?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Grade</label><input value={newMember.grade} onChange={(e) => setNewMember((m) => ({ ...m, grade: e.target.value }))} placeholder="Year 11" /></div>
        </div>
        <button className="btn btn-primary" disabled={busy || !newMember.full_name || !newMember.email} onClick={create}>Create member</button>
      </div>
    </Layout>
  );
}
