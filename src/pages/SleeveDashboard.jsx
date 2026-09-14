import Layout from '../components/Layout.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useTable, useView } from '../hooks.js';
import LineChart from '../components/LineChart.jsx';
import { money, pct, pctAbs } from '../format.js';

export default function SleeveDashboard() {
  const { profile } = useAuth();
  const sleeves = useTable('sleeves');
  const profiles = useTable('profiles');
  const exposures = useView('exposures');
  const leaderboard = useView('leaderboard');
  const nameOf = (uid) => profiles.data?.find((p) => p.user_id === uid)?.full_name || uid;
  const sleeveIndex = useView('sleeve_index', { sleeve_id: profile.sleeve_id });
  const benchSeries = useView('benchmark_series', { ticker: sleeves.data?.find((s) => s.id === profile.sleeve_id)?.benchmark });

  const sleeve = sleeves.data?.find((s) => s.id === profile.sleeve_id);
  const positions = exposures.data?.positions.filter((p) => p.sleeve_id === profile.sleeve_id) || [];
  const sleeveValue = positions.reduce((a, p) => a + p.market_value, 0);
  const analysts = leaderboard.data?.filter((r) => r.pitches > 0).filter((r) => positions.some((p) => r.tickers?.includes(p.ticker)) || true) || [];

  const benchIndexed = (points) => {
    if (!points?.length) return [];
    const base = points[0].value;
    return points.map((p) => ({ date: p.date, value: (p.value / base) * 100 }));
  };

  return (
    <Layout title={`${sleeve?.name || 'Sleeve'} Dashboard`}>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat-tile">
          <div className="label">Sleeve value</div>
          <div className="value">{money(sleeveValue)}</div>
          <div className="delta muted">{positions.length} positions</div>
        </div>
        <div className="card stat-tile">
          <div className="label">Weight of NAV</div>
          <div className="value">{pctAbs(exposures.data ? (sleeveValue / exposures.data.nav) * 100 : 0)}</div>
        </div>
        <div className="card stat-tile">
          <div className="label">Benchmark</div>
          <div className="value">{sleeve?.benchmark}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>Sleeve return vs {sleeve?.benchmark}, indexed to 100</h2></div>
        <div className="card-pad">
          {sleeveIndex.data && benchSeries.data && (
            <LineChart
              formatValue={(v) => v.toFixed(1)}
              series={[
                { id: 'sleeve', label: sleeve?.name, color: 'var(--purple-500)', points: sleeveIndex.data },
                { id: 'bench', label: sleeve?.benchmark, color: 'var(--green-500)', points: benchIndexed(benchSeries.data) },
              ]}
            />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Positions in this sleeve</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ticker</th><th className="num">Weight</th><th className="num">Unrealised P&amp;L</th><th className="num">Return</th></tr></thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker}>
                  <td style={{ fontWeight: 700 }}>{p.ticker}</td>
                  <td className="num mono">{pctAbs(p.weight_pct)}</td>
                  <td className={`num mono ${p.unrealised_pnl >= 0 ? 'pos' : 'neg'}`}>{money(p.unrealised_pnl)}</td>
                  <td className={`num mono ${p.return_pct >= 0 ? 'pos' : 'neg'}`}>{pct(p.return_pct)}</td>
                </tr>
              ))}
              {!positions.length && <tr><td colSpan={4} className="empty">No positions in this sleeve yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h2>Analyst scorecards</h2><span className="muted">fund-wide leaderboard</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Analyst</th><th className="num">P&amp;L attributed</th><th className="num">Pitches</th><th className="num">Approval rate</th><th className="num">Thesis hit rate</th></tr></thead>
            <tbody>
              {analysts.map((a) => (
                <tr key={a.user_id}>
                  <td>{nameOf(a.user_id)}</td>
                  <td className={`num mono ${a.pnl >= 0 ? 'pos' : 'neg'}`}>{money(a.pnl)}</td>
                  <td className="num mono">{a.pitches}</td>
                  <td className="num mono">{a.approval_rate != null ? pctAbs(a.approval_rate) : '—'}</td>
                  <td className="num mono">{a.thesis_hit_rate != null ? pctAbs(a.thesis_hit_rate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
