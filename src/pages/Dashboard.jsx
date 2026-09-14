import Layout from '../components/Layout.jsx';
import LineChart from '../components/LineChart.jsx';
import BarBreakdown from '../components/BarBreakdown.jsx';
import { useView } from '../hooks.js';
import { money, pct, pctAbs, timeAgo, dateTime } from '../format.js';

export default function Dashboard() {
  const summary = useView('summary');
  const navSeries = useView('nav_series');
  const benchSeries = useView('benchmark_series', { ticker: 'SPY' });
  const exposures = useView('exposures');

  const s = summary.data;
  const loading = summary.loading || navSeries.loading || benchSeries.loading;
  const stale = s && s.last_nav_job_at && Date.now() - new Date(s.last_nav_job_at).getTime() > 36 * 3600 * 1000;

  const indexed = (points) => {
    if (!points?.length) return [];
    const base = points[0].value;
    return points.map((p) => ({ date: p.date, value: (p.value / base) * 100 }));
  };

  return (
    <Layout
      title="Fund Dashboard"
      actions={
        <span className={`stale-badge${stale ? ' stale' : ''}`}>
          <span className="dot" />
          {s ? `Updated ${timeAgo(s.last_nav_job_at || s.as_of)}` : '—'}
          {s?.cron_paused ? ' · scheduler paused' : ''}
        </span>
      }
    >
      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <div className="card stat-tile">
              <div className="label">Net Asset Value</div>
              <div className="value">{money(s.nav)}</div>
              <div className={`delta ${s.inception_return_pct >= 0 ? 'pos' : 'neg'}`}>{pct(s.inception_return_pct)} since inception</div>
            </div>
            <div className="card stat-tile">
              <div className="label">Cash</div>
              <div className="value">{money(s.cash)}</div>
              <div className="delta muted">{pctAbs(s.cash_pct)} of NAV</div>
            </div>
            <div className="card stat-tile">
              <div className="label">Invested</div>
              <div className="value">{pctAbs(s.invested_pct)}</div>
              <div className="delta muted">{money(s.invested)}</div>
            </div>
            <div className="card stat-tile">
              <div className="label">Positions</div>
              <div className="value">{s.position_count}</div>
              <div className="delta muted">target 12–20 names</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h2>NAV vs S&amp;P 500 (SPY), indexed to 100 at inception</h2>
              <span className="muted">as of {s.as_of}</span>
            </div>
            <div className="card-pad">
              <LineChart
                formatValue={(v) => v.toFixed(1)}
                series={[
                  { id: 'nav', label: 'HSC Fund', color: 'var(--purple-500)', points: indexed(navSeries.data) },
                  { id: 'spy', label: 'SPY (benchmark)', color: 'var(--green-500)', points: indexed(benchSeries.data) },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <div className="card-header">
                <h2>Exposure by asset class</h2>
              </div>
              <div className="card-pad">
                <BarBreakdown rows={exposures.data?.by_asset_class.map((r) => ({ key: r.key, label: `${r.label} (${r.count})`, pct: r.pct, value: r.value }))} />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h2>Exposure by sleeve</h2>
              </div>
              <div className="card-pad">
                <BarBreakdown rows={exposures.data?.by_sleeve.map((r) => ({ key: r.key, label: `${r.label} (${r.count})`, pct: r.pct, value: r.value }))} />
              </div>
            </div>
          </div>

          {s.last_snapshot && (
            <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
              Last nightly NAV run: {dateTime(s.last_snapshot.created_at)} · {s.last_snapshot.position_count} positions ·{' '}
              {money(s.last_snapshot.cash)} cash
            </p>
          )}
        </>
      )}
    </Layout>
  );
}
