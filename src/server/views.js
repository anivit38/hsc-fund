// Read-side "views". Positions are never stored — they are summed from fills,
// exactly like v_positions / v_cash / v_book / v_nav in the spec.

import { ASSET_CLASSES } from './universe.js';
import { monthOf, monthLabel } from './calendar.js';

export const security = (s, ticker) => s.securities.find((x) => x.ticker === ticker);

export const sleeveForClass = (s, assetClass) => s.sleeves.find((sl) => sl.asset_classes.includes(assetClass));

export const sleeveForTicker = (s, ticker) => {
  const sec = security(s, ticker);
  return sec ? sleeveForClass(s, sec.asset_class) : null;
};

/** v_positions — average cost is measured since the position was last flat. */
export function positions(s) {
  const map = new Map();
  for (const f of s.fills) {
    let p = map.get(f.ticker);
    if (!p) map.set(f.ticker, (p = { ticker: f.ticker, qty: 0, buyQty: 0, buyCost: 0 }));
    if (f.side === 'buy') {
      p.qty += f.qty;
      p.buyQty += f.qty;
      p.buyCost += f.qty * f.price;
    } else {
      p.qty -= f.qty;
      if (p.qty === 0) {
        p.buyQty = 0;
        p.buyCost = 0;
      }
    }
  }
  return [...map.values()]
    .filter((p) => p.qty !== 0)
    .map((p) => ({ ticker: p.ticker, qty: p.qty, avg_cost: p.buyQty ? p.buyCost / p.buyQty : null }));
}

/** v_cash */
export const cash = (s) => s.cash_ledger.reduce((sum, row) => sum + row.delta, 0);

/** v_book */
export function book(s) {
  const rows = positions(s).map((p) => {
    const sec = security(s, p.ticker);
    const market_value = p.qty * sec.last_close;
    return {
      ...p,
      name: sec.name,
      asset_class: sec.asset_class,
      sector: sec.sector,
      region: sec.region,
      pricing: sec.pricing,
      last_close: sec.last_close,
      last_close_at: sec.last_close_at,
      market_value,
      unrealised_pnl: p.qty * (sec.last_close - p.avg_cost),
      return_pct: p.avg_cost ? (sec.last_close / p.avg_cost - 1) * 100 : null,
      sleeve_id: sleeveForClass(s, sec.asset_class)?.id ?? null,
    };
  });
  const total = nav(s, rows);
  return rows.map((r) => ({ ...r, weight_pct: (r.market_value / total) * 100 }));
}

/** v_nav */
export function nav(s, bookRows) {
  const rows = bookRows ?? positions(s).map((p) => ({ market_value: p.qty * security(s, p.ticker).last_close }));
  return cash(s) + rows.reduce((sum, r) => sum + r.market_value, 0);
}

export function summary(s) {
  const rows = book(s);
  const c = cash(s);
  const total = nav(s, rows);
  const invested = total - c;
  const snaps = s.nav_snapshots;
  const lastSnap = snaps[snaps.length - 1] ?? null;
  const spy = s.benchmarks.filter((b) => b.ticker === s.fund_config.fund_benchmark);
  const spyReturn = spy.length > 1 ? (spy[spy.length - 1].close / spy[0].close - 1) * 100 : 0;
  const lastJob = [...s.job_runs].reverse().find((j) => j.job_name === 'run_nav' && j.status === 'ok');
  return {
    nav: total,
    cash: c,
    invested,
    cash_pct: (c / total) * 100,
    invested_pct: (invested / total) * 100,
    position_count: rows.length,
    inception_return_pct: (total / s.fund_config.inception_capital - 1) * 100,
    benchmark_return_pct: spyReturn,
    as_of: s.clock.date,
    last_snapshot: lastSnap,
    last_nav_job_at: lastJob?.ran_at ?? null,
    cron_paused: s.clock.cron_paused,
  };
}

export function exposures(s) {
  const rows = book(s);
  const total = nav(s, rows);
  const group = (key, labelFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = r[key];
      const g = m.get(k) || { key: k, label: labelFn ? labelFn(k) : k, value: 0, count: 0 };
      g.value += r.market_value;
      g.count++;
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, pct: (g.value / total) * 100 })).sort((a, b) => b.value - a.value);
  };
  return {
    nav: total,
    by_asset_class: group('asset_class', (k) => ASSET_CLASSES[k]?.label ?? k),
    by_sector: group('sector'),
    by_sleeve: group('sleeve_id', (k) => s.sleeves.find((x) => x.id === k)?.name ?? 'Unassigned'),
    positions: rows,
  };
}

export function navSeries(s) {
  return s.nav_snapshots.map((n) => ({ date: n.snap_date, value: n.nav }));
}

export function benchmarkSeries(s, ticker) {
  return s.benchmarks.filter((b) => b.ticker === ticker).map((b) => ({ date: b.snap_date, value: b.close }));
}

/** Time-weighted return index for a sleeve, built from position_pnl_daily. */
export function sleeveIndex(s, sleeveId) {
  const tickers = new Set(s.securities.filter((x) => sleeveForClass(s, x.asset_class)?.id === sleeveId).map((x) => x.ticker));
  const byDate = new Map();
  for (const r of s.position_pnl_daily) {
    if (!tickers.has(r.ticker)) continue;
    const g = byDate.get(r.snap_date) || { pnl: 0, base: 0 };
    g.pnl += r.pnl;
    g.base += r.base;
    byDate.set(r.snap_date, g);
  }
  let level = 100;
  return s.nav_snapshots.map((n) => {
    const g = byDate.get(n.snap_date);
    if (g && g.base > 0) level *= 1 + g.pnl / g.base;
    return { date: n.snap_date, value: level };
  });
}

/** Which analyst "owns" each day's P&L for a ticker: the latest executed buy-side pitch. */
function ownershipResolver(s) {
  const byTicker = new Map();
  const ordersById = new Map(s.orders.map((o) => [o.id, o]));
  for (const p of s.pitches) {
    if (p.side !== 'buy' || !p.order_id) continue;
    const o = ordersById.get(p.order_id);
    if (!o || o.status !== 'filled') continue;
    const list = byTicker.get(p.ticker) || [];
    list.push({ from: o.filled_at.slice(0, 10), analyst_id: p.analyst_id, kind: p.kind });
    byTicker.set(p.ticker, list);
  }
  for (const list of byTicker.values()) list.sort((a, b) => a.from.localeCompare(b.from));
  return (ticker, date) => {
    const list = byTicker.get(ticker);
    if (!list) return null;
    let owner = null;
    for (const e of list) {
      if (e.from <= date && (e.kind === 'entry' || !owner)) owner = e.analyst_id;
    }
    return owner;
  };
}

export function leaderboard(s) {
  const owner = ownershipResolver(s);
  const stats = new Map();
  const get = (id) => {
    if (!stats.has(id)) stats.set(id, { user_id: id, pnl: 0, pitches: 0, submitted: 0, approved: 0, executed: 0, verdicts: {}, tickers: new Set() });
    return stats.get(id);
  };
  for (const p of s.profiles) if (p.role === 'analyst' || p.role === 'pm') get(p.user_id);
  for (const r of s.position_pnl_daily) {
    const id = owner(r.ticker, r.snap_date);
    if (!id) continue;
    const st = get(id);
    st.pnl += r.pnl;
    st.tickers.add(r.ticker);
  }
  for (const p of s.pitches) {
    if (p.status === 'draft') continue;
    const st = get(p.analyst_id);
    st.pitches++;
    st.submitted++;
    if (['pm_approved', 'executed', 'shelved'].includes(p.status)) st.approved++;
    if (p.status === 'executed') st.executed++;
  }
  for (const pm of s.post_mortems) {
    if (pm.status !== 'filed') continue;
    const st = get(pm.analyst_id);
    st.verdicts[pm.thesis_verdict] = (st.verdicts[pm.thesis_verdict] || 0) + 1;
  }
  return [...stats.values()]
    .map((st) => {
      const filed = Object.values(st.verdicts).reduce((a, b) => a + b, 0);
      const rightThesis = (st.verdicts.right_right || 0) + (st.verdicts.right_wrong || 0);
      return {
        ...st,
        tickers: [...st.tickers],
        approval_rate: st.submitted ? (st.approved / st.submitted) * 100 : null,
        thesis_hit_rate: filed ? (rightThesis / filed) * 100 : null,
      };
    })
    .sort((a, b) => b.pnl - a.pnl);
}

export function pendingPostMortem(s, userId) {
  return s.post_mortems.find((p) => p.analyst_id === userId && p.status === 'pending') ?? null;
}

/** Everything the monthly letter needs, assembled from data (Flow H step 2). */
export function letterData(s, month) {
  const inMonth = s.nav_snapshots.filter((n) => monthOf(n.snap_date) === month);
  if (!inMonth.length) return null;
  const before = s.nav_snapshots.filter((n) => n.snap_date < `${month}-01`);
  const start = before[before.length - 1] ?? inMonth[0];
  const end = inMonth[inMonth.length - 1];
  const bench = s.fund_config.fund_benchmark;
  const closeOn = (ticker, date) => s.benchmarks.find((b) => b.ticker === ticker && b.snap_date === date)?.close;
  const benchStart = closeOn(bench, start.snap_date);
  const benchEnd = closeOn(bench, end.snap_date);

  const pnlRows = s.position_pnl_daily.filter((r) => monthOf(r.snap_date) === month);
  const byTicker = new Map();
  const bySleeve = new Map();
  for (const r of pnlRows) {
    byTicker.set(r.ticker, (byTicker.get(r.ticker) || 0) + r.pnl);
    const sl = sleeveForTicker(s, r.ticker);
    bySleeve.set(sl?.name ?? 'Other', (bySleeve.get(sl?.name ?? 'Other') || 0) + r.pnl);
  }
  const contributors = [...byTicker.entries()].map(([ticker, pnl]) => ({ ticker, name: security(s, ticker)?.name, pnl })).sort((a, b) => b.pnl - a.pnl);

  const opened = s.fills
    .filter((f) => f.side === 'buy' && monthOf(f.session) === month)
    .filter((f) => {
      const earlier = s.fills.filter((x) => x.ticker === f.ticker && x.session < f.session);
      return earlier.reduce((q, x) => q + (x.side === 'buy' ? x.qty : -x.qty), 0) === 0;
    })
    .map((f) => f.ticker);

  return {
    month,
    label: monthLabel(month),
    nav_start: start.nav,
    nav_end: end.nav,
    fund_return_pct: (end.nav / start.nav - 1) * 100,
    benchmark: bench,
    benchmark_return_pct: benchStart && benchEnd ? (benchEnd / benchStart - 1) * 100 : null,
    since_inception_pct: (end.nav / s.fund_config.inception_capital - 1) * 100,
    sleeves: [...bySleeve.entries()].map(([name, pnl]) => ({ name, pnl })).sort((a, b) => b.pnl - a.pnl),
    top: contributors.slice(0, 3),
    bottom: contributors.slice(-3).reverse().filter((c) => c.pnl < 0),
    opened: [...new Set(opened)],
    closed: s.post_mortems.filter((p) => monthOf(p.created_at) === month).map((p) => p.ticker),
    verdicts: s.post_mortems.filter((p) => p.status === 'filed' && p.filed_at && monthOf(p.filed_at) === month).map((p) => ({ ticker: p.ticker, verdict: p.thesis_verdict })),
    cash_pct: (end.cash / end.nav) * 100,
    position_count: end.position_count,
  };
}
