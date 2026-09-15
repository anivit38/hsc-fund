// Demo history. The fund is seeded at inception with $1M cash and the scheduler is
// replayed session by session up to today, with a scripted set of IC decisions
// applied along the way through the same order/fill/NAV engine as live use.

import { getState, replaceState, tx, batch, uuid, loadPersistedAsync } from './store.js';
import { FUND_CONFIG, SLEEVES, PROFILES, SECURITIES } from './universe.js';
import { CRON_SECRET, run_nav, catchUp, previewTrade, audit, generate_letter } from './functions.js';
import { lastCompletedSession, previousMonth } from './calendar.js';
import { update } from './policies.js';
import { hashPassword } from './auth.js';

// Every seeded member starts with this password (documented in DEPLOY.md /
// the login screen's helper text). There is no self-signup, per the spec —
// the CIO resets a forgotten password from the Members screen.
export const DEFAULT_PASSWORD = 'welcome2026';

export const SCHEMA_VERSION = 3;

function initialState() {
  return {
    schema_version: SCHEMA_VERSION,
    clock: { date: null, cron_paused: false },
    seq: { audit: 0, job: 0 },
    fund_config: structuredClone(FUND_CONFIG),
    sleeves: structuredClone(SLEEVES),
    profiles: PROFILES.map((p) => ({
      ...p,
      active: true,
      approved: true, // seed members are pre-vetted founding members, not self-signups
      created_at: `${FUND_CONFIG.inception_date}T09:00:00.000Z`,
      password_hash: hashPassword(DEFAULT_PASSWORD),
    })),
    securities: structuredClone(SECURITIES),
    sessions: [],
    prices: {},
    pitches: [],
    pitch_comments: [],
    orders: [],
    fills: [],
    cash_ledger: [],
    nav_snapshots: [],
    benchmarks: [],
    position_pnl_daily: [],
    post_mortems: [],
    letters: [],
    audit_log: [],
    job_runs: [],
  };
}

const PM_FOR = Object.fromEntries(SLEEVES.map((s) => [s.id, s.pm_user_id]));
const SLEEVE_OF = Object.fromEntries(PROFILES.map((p) => [p.user_id, p.sleeve_id]));

// day = session index after inception at whose close the IC executed the pitch.
const HISTORY = [
  { day: 2, analyst: 'u-mia', ticker: 'AAPL', wt: 6, conviction: 4, horizon: 12, target: 265, stop: 195,
    thesis: 'Services revenue is compounding at double digits and now carries ~70% gross margin, so earnings quality keeps improving even while iPhone units are flat. The installed base of 2bn+ devices is the moat.',
    catalyst: 'Next two earnings prints showing Services growth above 12%.',
    falsifier: 'Services growth drops below 8% for two consecutive quarters, or a court ruling removes default-search payments.' },
  { day: 2, analyst: 'u-oliver', ticker: 'AGG', wt: 7, conviction: 3, horizon: 18, target: 104, stop: 95,
    thesis: 'Starting yields near 4.5% give the fund a real income floor and ballast if equities sell off. Duration is moderate, so we are paid to wait for rate cuts without betting the fund on them.',
    catalyst: 'Central bank easing cycle.',
    falsifier: 'Core inflation re-accelerates above 3.5% and the market prices hikes back in.' },
  { day: 2, analyst: 'u-zara', ticker: 'RE-PARRA', wt: 6, conviction: 4, horizon: 36, target: 28500, stop: 22000,
    thesis: 'Parramatta is Sydney’s second CBD with the Metro West line arriving; a premium-grade tower with 94% occupancy and long government leases gives bond-like rent with inflation-linked reviews.',
    catalyst: 'Metro West opening and two lease renewals due next year.',
    falsifier: 'Occupancy falls below 85% or the anchor government tenant does not renew.' },
  { day: 3, analyst: 'u-ethan', ticker: 'XOM', wt: 5, conviction: 3, horizon: 9, target: 128, stop: 100,
    thesis: 'Integrated oil major with a low break-even; buybacks plus dividend yield ~6% at current prices. Tight OPEC+ supply supports crude above $75.',
    catalyst: 'OPEC+ meeting extending cuts.',
    falsifier: 'Brent sustains below $70 for a month or OPEC+ announces production increases.' },
  { day: 4, analyst: 'u-chloe', ticker: 'GLD', wt: 6, conviction: 4, horizon: 12, target: 330, stop: 280,
    thesis: 'Central banks are buying gold at record pace to diversify reserves; gold hedges both geopolitical shocks and a policy mistake that the rest of the book is exposed to.',
    catalyst: 'Continued central bank purchases in quarterly WGC data.',
    falsifier: 'Real yields rise above 2.5% while central bank buying slows by half.' },
  { day: 5, analyst: 'u-chloe', ticker: 'USO', wt: 4, conviction: 2, horizon: 6, target: 85, stop: 68,
    thesis: 'Summer driving season plus inventory draws should lift front-month crude.',
    catalyst: 'Weekly EIA inventory draws through July.',
    falsifier: 'Three consecutive weekly inventory builds.' },
  { day: 6, analyst: 'u-mia', ticker: 'MSFT', wt: 5, conviction: 5, horizon: 24, target: 520, stop: 390,
    thesis: 'Azure is the enterprise default for AI workloads and Copilot seats add a second monetisation layer on top of the Office base.',
    catalyst: 'Azure growth re-accelerating as new data-centre capacity comes online.',
    falsifier: 'Azure growth below 25% for two quarters while capex keeps rising.' },
  { day: 6, analyst: 'u-lucas', ticker: 'VNQ', wt: 5, conviction: 3, horizon: 18, target: 102, stop: 84,
    thesis: 'Listed REITs trade at a discount to private property valuations; rate cuts close that gap and we get daily liquidity that our direct property cannot offer.',
    catalyst: 'First rate cut.',
    falsifier: 'The 10-year yield rises above 5%.' },
  { day: 8, analyst: 'u-ethan', ticker: 'NVDA', wt: 5, conviction: 4, horizon: 12, target: 175, stop: 115,
    thesis: 'Data-centre GPU demand still exceeds supply and the CUDA software ecosystem makes switching costly for customers.',
    catalyst: 'Next-generation chip ramp.',
    falsifier: 'Hyperscaler capex guidance is cut or gross margin falls below 70%.' },
  { day: 9, analyst: 'u-zara', ticker: 'RE-MOORE', wt: 6, conviction: 4, horizon: 36, target: 23500, stop: 17000,
    thesis: 'Western Sydney industrial vacancy is under 2%; e-commerce and the new airport make last-mile logistics land scarce, and rents reset higher on every lease expiry.',
    catalyst: 'Rent reviews on 30% of the estate this year.',
    falsifier: 'Industrial vacancy in Western Sydney rises above 5%.' },
  { day: 10, analyst: 'u-oliver', ticker: 'ACGB-10Y', wt: 6, conviction: 3, horizon: 24, target: 102, stop: 92,
    thesis: 'Australian 10-year bonds yield more than US Treasuries with a stronger fiscal position; they diversify our US bond exposure.',
    catalyst: 'RBA cutting cycle.',
    falsifier: 'Australian trimmed-mean inflation above 3.5%.' },
  { day: 12, analyst: 'u-mia', ticker: 'BHP.AX', wt: 5, conviction: 3, horizon: 18, target: 48, stop: 36,
    thesis: 'Copper is the electrification metal and BHP’s growing copper share is under-appreciated relative to iron ore.',
    catalyst: 'Chinese stimulus and copper supply deficits.',
    falsifier: 'Iron ore below US$80/t for a quarter.' },
  { day: 14, analyst: 'u-chloe', ticker: 'PM-INFRA', wt: 5, conviction: 4, horizon: 60, target: 6200, stop: 4300,
    thesis: 'Airport infrastructure has monopoly-like economics with CPI-linked charges; Western Sydney airport opens into a catchment of 2.5m people.',
    catalyst: 'First passenger flights.',
    falsifier: 'Opening delayed beyond 12 months or airline commitments fall through.' },
  { day: 16, analyst: 'u-ethan', ticker: 'CSL.AX', wt: 5, conviction: 3, horizon: 24, target: 285, stop: 215,
    thesis: 'Plasma collection costs have normalised post-COVID, so margins should rebuild toward pre-2020 levels.',
    catalyst: 'Gross margin recovery at the full-year result.',
    falsifier: 'Plasma cost per litre rises again or margin guidance is cut.' },
  { day: 19, analyst: 'u-mia', ticker: 'JPM', wt: 5, conviction: 3, horizon: 12, target: 270, stop: 210,
    thesis: 'Best-in-class bank with fortress balance sheet; net interest income holds up better than peers in a slow-cutting cycle.',
    catalyst: 'Investment banking fee recovery.',
    falsifier: 'Credit card charge-offs exceed 4.5%.' },
  { day: 24, kind: 'exit', analyst: 'u-chloe', ticker: 'USO', conviction: 3, target: 70, stop: 80,
    thesis: 'The inventory-draw thesis did not play out and contango is eroding the fund’s returns every roll.',
    catalyst: 'Driving season is over.',
    falsifier: 'A supply shock that lifts front-month crude above $85.' },
  { day: 34, kind: 'exit', analyst: 'u-ethan', ticker: 'XOM', conviction: 4, target: 100, stop: 120,
    thesis: 'OPEC+ has started unwinding cuts, breaking the supply part of the original thesis.',
    catalyst: 'OPEC+ production increase announcement.',
    falsifier: 'OPEC+ reverses course and re-imposes cuts.' },
];

function seedExecutedPitch(s, spec, date) {
  const sleeve_id = SLEEVE_OF[spec.analyst];
  const kind = spec.kind ?? 'entry';
  const side = kind === 'entry' || kind === 'add' ? 'buy' : 'sell';
  const at = `${date}T08:00:00.000Z`;
  const pitch = {
    id: uuid(), kind, analyst_id: spec.analyst, sleeve_id, ticker: spec.ticker, side, status: 'pm_approved',
    thesis: spec.thesis, catalyst: spec.catalyst, falsifier: spec.falsifier,
    price_target: spec.target, stop_price: spec.stop, horizon_months: spec.horizon ?? 6, conviction: spec.conviction,
    suggested_wt_pct: spec.wt ?? null,
    pm_user_id: PM_FOR[sleeve_id], pm_note: kind === 'exit' ? 'Agree the thesis is broken — approve exit.' : 'Clear falsifier and sensible sizing. Approved for IC.',
    pm_wt_pct: kind === 'exit' ? 0 : spec.wt, pm_decided_at: at,
    order_id: null, submitted_at: at, expires_at: new Date(new Date(at).getTime() + 21 * 86400000).toISOString(), created_at: at,
  };
  s.pitches.push(pitch);
  const pv = previewTrade(s, { ticker: pitch.ticker, side, kind, target_wt_pct: pitch.pm_wt_pct });
  if (pv.qty < 1 || pv.hard_breaches.length) return;
  const order = {
    id: uuid(), pitch_id: pitch.id, ticker: pitch.ticker, side, qty: pv.qty, target_wt_pct: pitch.pm_wt_pct,
    ref_price: pv.price, status: 'pending_open', created_by: 'u-alex', risk_override: pv.breaches.length > 0,
    override_note: pv.breaches.length ? 'IC agreed to accept the breach.' : null, breaches: pv.breaches.map((c) => c.label),
    reject_reason: null, created_at: `${date}T21:00:00.000Z`, filled_at: null,
  };
  s.orders.push(order);
  pitch.status = 'executed';
  pitch.order_id = order.id;
  audit(s, 'u-alex', 'pitch.executed', 'pitches', pitch.id, { order_id: order.id, ticker: order.ticker, side, qty: order.qty, ref_price: order.ref_price }, order.created_at);
}

function seedCurrentActivity() {
  tx((s) => {
    const now = Date.now();
    const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
    const expires = (daysAgo) => new Date(now - daysAgo * 86400000 + 21 * 86400000).toISOString();
    const base = { catalyst: null, price_target: null, stop_price: null, horizon_months: 12, conviction: 3, suggested_wt_pct: null, pm_user_id: null, pm_note: null, pm_wt_pct: null, pm_decided_at: null, order_id: null };
    const px = (t) => s.securities.find((x) => x.ticker === t).last_close;
    const add = (p) => {
      const row = { ...base, id: uuid(), side: 'buy', kind: 'entry', ...p };
      s.pitches.push(row);
      return row;
    };

    const amzn = add({
      analyst_id: 'u-mia', sleeve_id: 'sl-eq', ticker: 'AMZN', status: 'submitted',
      thesis: 'AWS margins are expanding as AI inference workloads scale, and retail is now structurally profitable thanks to regionalised fulfilment. The market still values it like a low-margin retailer.',
      catalyst: 'AWS operating margin above 35% next quarter.',
      falsifier: 'AWS growth decelerates below 15% while capex guidance rises again.',
      price_target: Math.round(px('AMZN') * 1.22), stop_price: Math.round(px('AMZN') * 0.85), horizon_months: 18, conviction: 4, suggested_wt_pct: 5,
      submitted_at: iso(2), expires_at: expires(2), created_at: iso(3),
    });
    add({
      analyst_id: 'u-lucas', sleeve_id: 'sl-re', ticker: 'RE-BONDI', status: 'submitted',
      thesis: 'Eastern suburbs rental vacancy is under 1% and the syndicate’s apartments are 15% under market rent on legacy leases; re-leasing lifts income without any capital spend.',
      catalyst: 'Four leases roll off in the next six months.',
      falsifier: 'Sydney rental vacancy rises above 3% or rent-control legislation passes in NSW.',
      price_target: 11800, stop_price: 8800, horizon_months: 36, conviction: 3, suggested_wt_pct: 5,
      submitted_at: iso(1), expires_at: expires(1), created_at: iso(1),
    });
    add({
      analyst_id: 'u-priya', sleeve_id: 'sl-eq', ticker: 'QQQ', status: 'submitted',
      thesis: 'Rather than picking more single tech names, a Nasdaq-100 position gives diversified exposure to the AI capex cycle.',
      catalyst: 'Mega-cap earnings season.', falsifier: 'Nasdaq forward P/E above 32x with earnings revisions turning negative.',
      price_target: Math.round(px('QQQ') * 1.15), stop_price: Math.round(px('QQQ') * 0.88), horizon_months: 12, conviction: 3, suggested_wt_pct: 4,
      submitted_at: iso(2), expires_at: expires(2), created_at: iso(2),
    });
    add({
      analyst_id: 'u-zara', sleeve_id: 'sl-re', ticker: 'RE-FARM', status: 'pm_approved',
      thesis: 'Irrigated farmland has delivered positive real returns with low correlation to listed markets; water entitlements are a scarce asset that reprices with inflation.',
      catalyst: 'Water allocation announcements for the coming season.',
      falsifier: 'Murray–Darling water allocations cut below 50% for two consecutive seasons.',
      price_target: 5800, stop_price: 4400, horizon_months: 60, conviction: 4, suggested_wt_pct: 5,
      pm_user_id: 'u-liam', pm_note: 'Good diversifier for the property sleeve. Approved at 5%.', pm_wt_pct: 5, pm_decided_at: iso(1),
      submitted_at: iso(4), expires_at: expires(4), created_at: iso(5),
    });
    add({
      analyst_id: 'u-oliver', sleeve_id: 'sl-fi', ticker: 'LQD', status: 'pm_approved',
      thesis: 'Investment-grade corporate spreads compensate for default risk several times over and balance sheets are strong.',
      catalyst: 'Rate cuts pulling yields lower.', falsifier: 'IG spreads widen past 150bp.',
      price_target: Math.round(px('LQD') * 1.08), stop_price: Math.round(px('LQD') * 0.94), horizon_months: 18, conviction: 3, suggested_wt_pct: 5,
      pm_user_id: 'u-sofia', pm_note: 'Adds carry without much duration. Approved.', pm_wt_pct: 5, pm_decided_at: iso(1),
      submitted_at: iso(3), expires_at: expires(3), created_at: iso(3),
    });
    add({
      analyst_id: 'u-chloe', sleeve_id: 'sl-alt', ticker: 'IBIT', status: 'pm_approved',
      thesis: 'Spot bitcoin ETF inflows from advisors and pensions are a new, persistent source of demand against a fixed supply schedule.',
      catalyst: 'Major wealth platforms enabling ETF access.', falsifier: 'Four straight weeks of net ETF outflows.',
      price_target: Math.round(px('IBIT') * 1.4), stop_price: Math.round(px('IBIT') * 0.75), horizon_months: 12, conviction: 3, suggested_wt_pct: 6,
      pm_user_id: 'u-noah', pm_note: 'Approving at 6% so IC can debate — this breaches the 5% digital-asset limit and needs a CIO override.', pm_wt_pct: 6, pm_decided_at: iso(0.5),
      submitted_at: iso(2), expires_at: expires(2), created_at: iso(2),
    });
    add({
      analyst_id: 'u-mia', sleeve_id: 'sl-eq', ticker: 'TSLA', status: 'pm_rejected',
      thesis: 'Robotaxi launch will re-rate the stock.', catalyst: 'Robotaxi launch event.',
      falsifier: 'Launch delayed again.', price_target: Math.round(px('TSLA') * 1.5), stop_price: Math.round(px('TSLA') * 0.8), horizon_months: 6, conviction: 5, suggested_wt_pct: 8,
      pm_user_id: 'u-priya', pm_note: 'The thesis is a single event and the falsifier is not measurable. What does the core auto business earn if robotaxi slips a year? Re-pitch with valuation work.', pm_decided_at: iso(6),
      submitted_at: iso(8), expires_at: expires(8), created_at: iso(9),
    });
    add({
      analyst_id: 'u-mia', sleeve_id: 'sl-eq', ticker: 'WOW.AX', status: 'draft',
      thesis: 'Defensive supermarket at a multi-year low valuation after market-share losses to Coles and Aldi.',
      falsifier: '', horizon_months: 12, conviction: 2, suggested_wt_pct: 4, submitted_at: null, expires_at: null, created_at: iso(0.2),
    });

    const comment = (pitch, author, body, daysAgo) => s.pitch_comments.push({ id: uuid(), pitch_id: pitch.id, author_id: author, body, created_at: iso(daysAgo) });
    comment(amzn, 'u-priya', 'How much of the valuation depends on AWS versus retail? Can you show a sum-of-the-parts?', 1.5);
    comment(amzn, 'u-mia', 'Added to my notes for IC: AWS at 25x EBIT is ~65% of the current market cap, so retail is priced at roughly zero growth.', 1.2);
    comment(amzn, 'u-carter', 'Nice use of a measurable falsifier. Consider what the stop price implies about your conviction level.', 1);
  });
}

export async function bootDatabase() {
  const saved = await loadPersistedAsync();
  if (saved?.schema_version === SCHEMA_VERSION) {
    replaceState(saved);
    batch(() => catchUp());
    return;
  }
  seedDatabase();
}

export function seedDatabase(target = lastCompletedSession()) {
  batch(() => {
    const s0 = initialState();
    s0.cash_ledger.push({ id: uuid(), delta: s0.fund_config.inception_capital, reason: 'inception', ref_id: null, created_at: `${s0.fund_config.inception_date}T09:00:00.000Z` });
    replaceState(s0);
    run_nav(null, { secret: CRON_SECRET, date: s0.fund_config.inception_date });

    let dayIndex = 0;
    catchUp(target, {
      force: true,
      onClose: (date) => {
        const s = getState();
        if (s.sessions[s.sessions.length - 1] !== date) return;
        dayIndex = s.sessions.length - 1;
        const due = HISTORY.filter((h) => h.day === dayIndex);
        if (due.length) tx((d) => due.forEach((h) => seedExecutedPitch(d, h, date)));
        if (dayIndex === 27) {
          const pm = getState().post_mortems.find((p) => p.ticker === 'USO' && p.status === 'pending');
          if (pm) {
            update('u-chloe', 'post_mortems', pm.id, {
              status: 'filed',
              what_happened: 'Inventories built instead of drawing as refinery demand disappointed, and the fund’s futures roll cost added a steady drag. I exited near the stop.',
              thesis_verdict: 'wrong_wrong',
              lesson: 'Commodity ETFs carry roll costs, so a short-horizon seasonal thesis needs a much larger expected move to be worth it. I will size seasonal trades at the minimum and always model contango.',
            });
          }
        }
      },
    });

    seedCurrentActivity();
    const s = getState();
    const lastMonth = previousMonth(s.clock.date);
    if (s.nav_snapshots.some((n) => n.snap_date.startsWith(lastMonth))) {
      const letter = generate_letter(null, { secret: CRON_SECRET, month: lastMonth });
      update('u-mia', 'letters', letter.id, { status: 'published' });
    }
  });
}
