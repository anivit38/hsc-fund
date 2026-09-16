import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';

const SECTIONS = [
  { id: 'basics', label: 'The Basics', roles: null },
  { id: 'analyst', label: 'For Analysts', roles: ['analyst'] },
  { id: 'pm', label: 'For PMs', roles: ['pm'] },
  { id: 'cio', label: 'For the CIO', roles: ['cio'] },
  { id: 'trades', label: 'How a Trade Happens', roles: null },
  { id: 'account', label: 'Account', roles: null },
];

function Card({ title, children }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 19 }}>{title}</h2>
      <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export default function Guide() {
  const { profile } = useAuth();
  const [active, setActive] = useState('basics');
  const visible = SECTIONS.filter((s) => !s.roles || s.roles.includes(profile?.role));

  return (
    <Layout title="Guide" subtitle="Everything you need to know to use the fund, organized by what you can do here.">
      <div className="tabs">
        {visible.map((s) => (
          <button key={s.id} className={`tab${active === s.id ? ' active' : ''}`} onClick={() => setActive(s.id)}>{s.label}</button>
        ))}
      </div>

      {active === 'basics' && (
        <>
          <Card title="What this is">
            <p>
              A paper-trading platform for the school investment club. Nobody's real money moves — the fund started
              with <strong>$1,000,000</strong> of pretend cash and everything else (stocks, bonds, real estate,
              commodities, crypto, private-market units) is tracked the same way a real fund would: analysts research
              and pitch ideas, a Portfolio Manager reviews them, the CIO executes at the weekly Investment Committee,
              orders fill at the next session's opening price, and the fund's NAV is recalculated every trading night
              using real market prices pulled live from Yahoo Finance.
            </p>
          </Card>
          <Card title="The four roles">
            <dl className="kv" style={{ gridTemplateColumns: '140px 1fr' }}>
              <dt><span className="badge badge-green">Analyst</span></dt>
              <dd style={{ marginBottom: 12 }}>Researches and writes pitches — "I think we should buy X because…"</dd>
              <dt><span className="badge badge-blue">PM</span></dt>
              <dd style={{ marginBottom: 12 }}>Reviews pitches, approves or rejects them, sets the target position size. Can't approve their own pitch.</dd>
              <dt><span className="badge badge-purple">CIO</span></dt>
              <dd style={{ marginBottom: 12 }}>Runs Investment Committee, executes approved pitches, can trade directly (Quick Trade), manages members and risk limits, sees everything.</dd>
              <dt><span className="badge badge-gray">Advisor</span></dt>
              <dd>The faculty sponsor. Read-only, but can comment.</dd>
            </dl>
            <p className="muted" style={{ marginTop: 12 }}>
              Anyone can pitch any asset class — a stock analyst can just as easily pitch a piece of real estate or a
              bond. There's no lane restriction; the only real limits are the fund's actual risk rules (position size,
              sector concentration, cash reserve, etc.), which the system enforces automatically and shows you before
              every trade.
            </p>
          </Card>
          <Card title="Getting an account">
            <ol style={{ paddingLeft: 20 }}>
              <li>Click "Create account" on the sign-in screen.</li>
              <li>Enter your name, any email address, and a password (8+ characters).</li>
              <li>You'll land on a "pending approval" screen — normal. Every new account needs a CIO's approval before it can see or do anything.</li>
              <li>Once approved, sign back in — you're in as an Analyst. The CIO can change your role later if that's not right.</li>
            </ol>
            <p className="muted">Forgot your password? Ask the CIO to reset it from Members — there's no self-service reset for a group this size.</p>
          </Card>
        </>
      )}

      {active === 'analyst' && (
        <>
          <Card title="New Pitch">
            <p>
              Pick any ticker from the whole universe, write your thesis, and — required — write a{' '}
              <strong>falsifier</strong>: a specific, measurable thing that would prove you wrong. No falsifier, no
              submission. It's the single most important field in the form; a pitch without one is a hunch, not a
              thesis. Also fill in a price target, a stop price, and a suggested position size. Save as a draft and
              keep editing, or submit straight away.
            </p>
          </Card>
          <Card title="My Pitches">
            <p>Everything you've written — drafts, submitted, approved, rejected, executed. Click into any of them to see PM comments and the decision.</p>
          </Card>
          <Card title="Lessons Learned (post-mortems)">
            <p>
              When a position you originated gets fully sold, the system creates a pending post-mortem for you
              automatically. You explain what happened and — separately — whether your <strong>thesis</strong> was
              right or wrong, independent of whether you made money. "Right thesis, lost money" and "wrong thesis,
              made money by luck" are both real outcomes worth recording honestly. You can't start a new pitch until
              an overdue post-mortem is filed.
            </p>
          </Card>
        </>
      )}

      {active === 'pm' && (
        <>
          <Card title="Review Queue">
            <p>
              Every pitch waiting on a decision, fund-wide — any PM can review any pitch, just never their own. Open
              one, ask questions in the comment thread if something's unclear, then Approve (with a target weight and
              a note) or Reject (with a note explaining why).
            </p>
          </Card>
          <Card title="Sector View">
            <p>Pick any sleeve to see its positions, return vs. its benchmark, and the fund-wide analyst leaderboard.</p>
          </Card>
        </>
      )}

      {active === 'cio' && (
        <>
          <Card title="To Approve">
            <p>
              Every PM-approved pitch waiting for you to execute at Investment Committee. Preview the risk checks,
              then Execute (or pass — the pitch goes to "shelved"). A breached limit can still be executed with a
              required override note; it's logged.
            </p>
          </Card>
          <Card title="Control Center">
            <p>
              Home of <strong>Quick Trade</strong> — buy or sell anything directly, without a pitch. Requires a
              reason, goes through the same risk engine and next-open fill as an executed pitch. Below it, every
              order ever placed, with Cancel on anything still pending.
            </p>
          </Card>
          <Card title="Risk Panel">
            <p>Live weights against limits. Force-exit a position (requires a note) or mark a security halted/delisted.</p>
          </Card>
          <Card title="Members">
            <p>Approve pending signups, change roles/sleeves, deactivate an account, reset a password, or add someone directly. You can't deactivate or demote your own account — ask another CIO.</p>
          </Card>
        </>
      )}

      {active === 'trades' && (
        <Card title="How a trade actually happens">
          <ol style={{ paddingLeft: 20 }}>
            <li>An order is created — from an executed pitch, or Quick Trade.</li>
            <li>It sits as "pending" until the next trading session.</li>
            <li>Overnight, it fills at that session's real opening price — not today's price, which stops anyone gaming a delayed quote and matches how a real fund trades.</li>
            <li>Cash and holdings update; NAV is recalculated that night using real closing prices.</li>
          </ol>
          <p className="muted" style={{ marginTop: 10 }}>
            Every listed security (stocks, ETFs, bond funds, commodity funds, crypto ETFs) gets its price from the
            real market via Yahoo Finance — genuinely live. Direct real estate and private-market holdings are valued
            once a month, same as a real fund would carry them.
          </p>
        </Card>
      )}

      {active === 'account' && (
        <Card title="Account settings">
          <p>Change your password anytime from "Account settings" at the bottom of the sidebar.</p>
          <p>There's a light/dark mode toggle in the top-right of every page — cycles Dark → Light → Auto (follows your device).</p>
          <p className="muted">Questions or something looks wrong? Talk to the CIO first. Everything the fund does is logged in History.</p>
        </Card>
      )}
    </Layout>
  );
}
