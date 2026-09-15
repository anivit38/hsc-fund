import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useTable } from '../hooks.js';
import { StatusBadge, KindBadge } from '../components/Badge.jsx';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';
import { dateTime, date } from '../format.js';

function Field({ label, children }) {
  return (
    <div>
      <dt style={{ color: 'var(--ink-muted)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase' }}>{label}</dt>
      <dd style={{ margin: '2px 0 12px', fontSize: 13.5 }}>{children}</dd>
    </div>
  );
}

export default function PitchDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const pitches = useTable('pitches');
  const comments = useTable('pitch_comments');
  const profiles = useTable('profiles');
  const sleeves = useTable('sleeves');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState('');
  const [wt, setWt] = useState('');
  const [newComment, setNewComment] = useState('');
  const [preview, setPreview] = useState(null);
  const [overrideNote, setOverrideNote] = useState('');

  const pitch = pitches.data?.find((p) => p.id === id);
  const nameOf = (uid) => profiles.data?.find((p) => p.user_id === uid)?.full_name || uid;
  const sleeve = sleeves.data?.find((s) => s.id === pitch?.sleeve_id);
  const myComments = comments.data?.filter((c) => c.pitch_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) || [];

  if (pitches.loading) return <Layout title="Pitch"><div className="empty">Loading…</div></Layout>;
  if (!pitch) return <Layout title="Pitch not found"><div className="empty">This pitch doesn't exist, or you don't have access to it.</div></Layout>;

  const isMine = pitch.analyst_id === profile.user_id;
  // Any PM can decide on any submitted pitch fund-wide — sleeves don't gate
  // this, only self-approval does (never your own pitch).
  const isPM = profile.role === 'pm' && !isMine;
  const canSubmit = isMine && pitch.status === 'draft';
  const canDecide = isPM && pitch.status === 'submitted';
  const canExecute = profile.role === 'cio' && pitch.status === 'pm_approved';

  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await pitches.reload();
      await comments.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => run(() => api.update('pitches', pitch.id, { status: 'submitted' }));
  const decide = (status) =>
    run(() =>
      api.update('pitches', pitch.id, {
        status,
        pm_user_id: profile.user_id,
        pm_note: note,
        pm_wt_pct: status === 'pm_approved' ? Number(wt || pitch.suggested_wt_pct) : undefined,
      }),
    );
  const post = () =>
    run(async () => {
      if (!newComment.trim()) return;
      await api.insert('pitch_comments', { pitch_id: pitch.id, author_id: profile.user_id, body: newComment.trim() });
      setNewComment('');
    });

  const loadPreview = async () => {
    setErr(null);
    try {
      const pv = await api.view('preview_trade', { ticker: pitch.ticker, side: pitch.side, kind: pitch.kind, target_wt_pct: pitch.pm_wt_pct });
      setPreview(pv);
    } catch (e) {
      setErr(e.message);
    }
  };

  const execute = (override) =>
    run(async () => {
      await api.invoke('execute_pitch', { pitch_id: pitch.id, risk_override: !!override, override_note: override ? overrideNote : undefined });
      navigate('/orders');
    });
  const shelve = () => run(() => api.invoke('shelve_pitch', { pitch_id: pitch.id, note: overrideNote }));

  return (
    <Layout title={`${pitch.ticker} · ${pitch.kind} pitch`}>
      {err && <div className="banner banner-error">{err}</div>}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <KindBadge kind={pitch.kind} />
            <StatusBadge status={pitch.status} />
            <span className="badge badge-gray">{sleeve?.name}</span>
            <span className="badge badge-gray">conviction {pitch.conviction ?? '—'}/5</span>
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '1fr' }}>
            <Field label="Analyst">{nameOf(pitch.analyst_id)}</Field>
            <Field label="Thesis">{pitch.thesis || <em className="muted">Not written yet</em>}</Field>
            {pitch.catalyst && <Field label="Catalyst">{pitch.catalyst}</Field>}
            <Field label="Falsifier — what would make this wrong">
              {pitch.falsifier || <em className="muted" style={{ color: 'var(--terracotta-500)' }}>Required before submitting</em>}
            </Field>
            <div className="grid grid-3">
              <Field label="Price target">{pitch.price_target ? `$${pitch.price_target}` : '—'}</Field>
              <Field label="Stop price">{pitch.stop_price ? `$${pitch.stop_price}` : '—'}</Field>
              <Field label="Horizon">{pitch.horizon_months ? `${pitch.horizon_months} mo` : '—'}</Field>
            </div>
            <Field label="Suggested weight">{pitch.suggested_wt_pct ? `${pitch.suggested_wt_pct}%` : '—'}</Field>
            {pitch.pm_note && (
              <>
                <Field label={`PM decision — ${nameOf(pitch.pm_user_id)}`}>
                  {pitch.pm_note} {pitch.pm_wt_pct != null && <strong>({pitch.pm_wt_pct}% target)</strong>}
                </Field>
              </>
            )}
            {pitch.cio_note && <Field label="CIO note">{pitch.cio_note}</Field>}
          </dl>
          <p className="muted" style={{ fontSize: 11.5 }}>
            Created {date(pitch.created_at)}
            {pitch.submitted_at && ` · submitted ${date(pitch.submitted_at)}`}
            {pitch.expires_at && ` · expires ${date(pitch.expires_at)}`}
          </p>
        </div>

        <div>
          {canSubmit && (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Ready to submit?</h3>
              <p className="muted" style={{ fontSize: 12.5 }}>
                Edit this pitch from My Pitches. Submitting requires thesis, falsifier, price target, stop price and a suggested weight.
              </p>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>Submit for PM review</button>
            </div>
          )}

          {canDecide && (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>PM decision</h3>
              <div className="field">
                <label className="required">Target weight (%)</label>
                <input type="number" step="0.5" placeholder={pitch.suggested_wt_pct} value={wt} onChange={(e) => setWt(e.target.value)} />
              </div>
              <div className="field">
                <label className="required">Note</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you approving or rejecting this?" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-green" disabled={busy || !note.trim()} onClick={() => decide('pm_approved')}>Approve</button>
                <button className="btn btn-danger" disabled={busy || !note.trim()} onClick={() => decide('pm_rejected')}>Reject</button>
              </div>
            </div>
          )}

          {canExecute && (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>IC execution</h3>
              <button className="btn btn-sm" onClick={loadPreview} style={{ marginBottom: 10 }}>Preview risk checks</button>
              {preview && (
                <div style={{ marginBottom: 10 }}>
                  <p className="muted" style={{ fontSize: 12 }}>{preview.qty.toLocaleString()} shares/units at ~${preview.price} · fee ${preview.fee}</p>
                  {preview.checks.map((c) => (
                    <div className="checklist-item" key={c.key}>
                      <span className={`icon ${c.ok ? 'ok' : 'fail'}`}>{c.ok ? '✓' : '!'}</span>
                      <span>{c.label}</span>
                      <span className="checklist-detail">{c.detail}</span>
                    </div>
                  ))}
                </div>
              )}
              {preview?.breaches.length > 0 && (
                <div className="field">
                  <label className="required">Override note (required to proceed past a breach)</label>
                  <textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  disabled={busy || (preview?.hard_breaches.length > 0)}
                  onClick={() => execute(preview?.breaches.length > 0)}
                >
                  {preview?.breaches.length > 0 ? 'Execute with override' : 'Execute'}
                </button>
                <button className="btn" disabled={busy} onClick={shelve}>Pass → shelve</button>
              </div>
            </div>
          )}

          <div className="card card-pad">
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Discussion</h3>
            <div>
              {myComments.map((c) => (
                <div className="comment" key={c.id}>
                  <span className="who">{nameOf(c.author_id)}</span>
                  <span className="when">{dateTime(c.created_at)}</span>
                  <div className="body">{c.body}</div>
                </div>
              ))}
              {!myComments.length && <p className="muted" style={{ fontSize: 12.5 }}>No comments yet.</p>}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <textarea placeholder="Ask a question or leave a note…" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
            </div>
            <button className="btn btn-sm" disabled={busy || !newComment.trim()} onClick={post}>Post comment</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
