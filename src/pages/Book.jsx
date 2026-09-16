import { Fragment, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import LineChart from '../components/LineChart.jsx';
import CountUp from '../components/CountUp.jsx';
import { useView } from '../hooks.js';
import { SkeletonStatRow, SkeletonTable } from '../components/Skeleton.jsx';
import { money, pct, pctAbs, num, ASSET_CLASS_LABEL } from '../format.js';

function PriceHistoryRow({ ticker, colSpan }) {
  const { data, loading } = useView('price_series', { ticker });
  return (
    <tr>
      <td colSpan={colSpan} style={{ background: 'var(--surface-2)', padding: '16px 20px' }}>
        {loading ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Loading price history…</div>
        ) : data?.length > 1 ? (
          <LineChart
            height={160}
            formatValue={(v) => money(v, 2)}
            series={[{ id: ticker, label: `${ticker} close`, color: 'var(--ink)', points: data, area: true }]}
          />
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>Not enough price history yet.</div>
        )}
      </td>
    </tr>
  );
}

export default function Book() {
  const { data, loading } = useView('exposures');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('weight_pct');
  const [expanded, setExpanded] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.positions;
    if (filter !== 'all') r = r.filter((p) => p.asset_class === filter);
    return [...r].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
  }, [data, filter, sort]);

  const classes = useMemo(() => [...new Set(data?.positions.map((p) => p.asset_class) || [])], [data]);

  const totalPnl = rows.reduce((a, r) => a + r.unrealised_pnl, 0);
  const winners = rows.filter((r) => r.unrealised_pnl >= 0).length;
  const topPosition = [...rows].sort((a, b) => b.weight_pct - a.weight_pct)[0];
  const totalMarketValue = rows.reduce((a, r) => a + r.market_value, 0);

  return (
    <Layout title="Holdings" subtitle="Click any row to see its price history.">
      {loading ? (
        <>
          <SkeletonStatRow />
          <SkeletonTable rows={8} cols={7} />
        </>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <div className="card stat-tile">
              <div className="label">Market Value</div>
              <div className="value">$<CountUp value={Math.round(totalMarketValue)} /></div>
              <div className="delta muted">{rows.length} positions</div>
            </div>
            <div className="card stat-tile">
              <div className="label">Unrealised P&amp;L</div>
              <div className={`value ${totalPnl >= 0 ? 'pos' : 'neg'}`}>
                {totalPnl >= 0 ? '+' : '−'}$<CountUp value={Math.round(Math.abs(totalPnl))} />
              </div>
              <div className="delta muted">{winners} of {rows.length} positive</div>
            </div>
            <div className="card stat-tile">
              <div className="label">Largest position</div>
              <div className="value" style={{ fontSize: 20 }}>{topPosition?.ticker ?? '—'}</div>
              <div className="delta muted">{topPosition ? pctAbs(topPosition.weight_pct) : '—'} of NAV</div>
            </div>
            <div className="card stat-tile">
              <div className="label">Asset classes</div>
              <div className="value"><CountUp value={classes.length} /></div>
              <div className="delta muted">held right now</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>{rows.length} positions · NAV {money(data.nav)}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
                  <option value="all">All asset classes</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>{ASSET_CLASS_LABEL[c] || c}</option>
                  ))}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
                  <option value="weight_pct">Sort: weight</option>
                  <option value="unrealised_pnl">Sort: P&amp;L</option>
                  <option value="return_pct">Sort: return %</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th><th>Name</th><th>Asset class</th><th>Sector</th>
                    <th className="num">Qty</th><th className="num">Avg cost</th><th className="num">Last</th>
                    <th className="num">Market value</th><th className="num">Weight</th><th className="num">Unrealised P&amp;L</th><th className="num">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.ticker}>
                      <tr onClick={() => setExpanded(expanded === r.ticker ? null : r.ticker)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 700 }}>{expanded === r.ticker ? '▾ ' : '▸ '}{r.ticker}</td>
                        <td className="muted">{r.name}</td>
                        <td>{ASSET_CLASS_LABEL[r.asset_class] || r.asset_class}</td>
                        <td className="muted">{r.sector}</td>
                        <td className="num mono">{num(r.qty)}</td>
                        <td className="num mono">{money(r.avg_cost, 2)}</td>
                        <td className="num mono">{money(r.last_close, 2)}</td>
                        <td className="num mono">{money(r.market_value)}</td>
                        <td className="num mono">{pctAbs(r.weight_pct)}</td>
                        <td className={`num mono ${r.unrealised_pnl >= 0 ? 'pos' : 'neg'}`}>{money(r.unrealised_pnl)}</td>
                        <td className={`num mono ${r.return_pct >= 0 ? 'pos' : 'neg'}`}>{pct(r.return_pct)}</td>
                      </tr>
                      {expanded === r.ticker && <PriceHistoryRow ticker={r.ticker} colSpan={11} />}
                    </Fragment>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={11} className="empty">No positions match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
