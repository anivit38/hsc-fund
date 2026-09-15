import Layout from '../components/Layout.jsx';
import LineChart from '../components/LineChart.jsx';
import BarBreakdown from '../components/BarBreakdown.jsx';
import CountUp from '../components/CountUp.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
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

  const navSeriesData = indexed(navSeries.data);
  const oneDayDelta = navSeriesData.length > 1 ? navSeriesData.at(-1).value - navSeriesData.at(-2).value : 0;

  return (
    <Layout
      title="Dashboard"
      actions={
        <span className={`stale-badge${stale ? ' stale' : ''}`}>
          <span className="dot" />
          {s ? `Updated ${timeAgo(s.last_nav_job_at || s.as_of)}` : '—'}
          {s?.cron_paused ? ' · scheduler paused' : ''}
        </span>
      }
    >
      {loading ? (
        <>
          <SkeletonCard lines={3} />
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
        </>
      ) : (
        <>
          <div className="hero">
            <div>
              <div className="hero-figure"><CountUp value={s.nav} format={(v) => money(v)} /></div>
              <div className="hero-sub">Net Asset Value · as of {s.as_of}</div>
              <div className={`hero-delta ${s.inception_return_pct >= 0 ? 'pos' : 'neg'}`}>
                {pct(s.inception_return_pct)} since inception
              </div>
              <div className="hero-statrow">
                <div className="hero-stat"><b><CountUp value={s.position_count} format={(v) => Math.round(v)} /></b><span>positions</span></div>
                <div className="hero-stat"><b><CountUp value={s.cash_pct} format={(v) => pctAbs(v)} /></b><span>cash</span></div>
                <div className="hero-stat"><b><CountUp value={s.invested_pct} format={(v) => pctAbs(v)} /></b><span>invested</span></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>NAV vs S&amp;P 500, indexed to 100 at inception</span>
                <span className={`badge ${oneDayDelta >= 0 ? 'badge-green' : 'badge-red'}`}>{oneDayDelta >= 0 ? '▲' : '▼'} {Math.abs(oneDayDelta).toFixed(2)} today</span>
              </div>
              <LineChart
                height={220}
                formatValue={(v) => v.toFixed(1)}
                series={[
                  { id: 'nav', label: 'HSC Endowment', color: 'var(--ink)', points: navSeriesData, area: true },
                  { id: 'spy', label: 'SPY (benchmark)', color: 'var(--brass)', points: indexed(benchSeries.data) },
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
